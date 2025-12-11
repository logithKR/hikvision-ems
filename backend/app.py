"""
Hikvision EMS Backend API
Main application with all routes
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import sqlite3
import json
from datetime import datetime, timedelta
import logging
from database import init_db, get_db
from hikvision_service import HikvisionService
import os
from dotenv import load_dotenv

load_dotenv()

# Flask Setup
app = Flask(__name__)
CORS(app)

# Logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s'
)
logger = logging.getLogger(__name__)

# Services
hikvision = HikvisionService()

# ============================================
# CUSTOM ERROR HANDLER
# ============================================

class APIError(Exception):
    def __init__(self, message, status_code=400):
        self.message = message
        self.status_code = status_code

@app.errorhandler(APIError)
def handle_api_error(error):
    logger.error(f"API Error: {error.message}")
    return jsonify({
        'success': False,
        'message': error.message
    }), error.status_code

@app.errorhandler(404)
def not_found(error):
    return jsonify({
        'success': False,
        'message': 'Endpoint not found'
    }), 404

@app.errorhandler(Exception)
def handle_unexpected_error(error):
    logger.error(f"Unexpected error: {str(error)}", exc_info=True)
    return jsonify({
        'success': False,
        'message': 'An unexpected error occurred'
    }), 500

# ============================================
# EMPLOYEE ROUTES
# ============================================

@app.route('/api/employees', methods=['GET'])
def get_employees():
    """Get all employees with filters"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        status = request.args.get('status', 'active')
        search = request.args.get('search', '')
        department = request.args.get('department', '')
        
        query = "SELECT * FROM employees WHERE status = ?"
        params = [status]
        
        if search:
            query += " AND (name LIKE ? OR employee_id LIKE ?)"
            params.extend([f'%{search}%', f'%{search}%'])
        
        if department:
            query += " AND department = ?"
            params.append(department)
        
        query += " ORDER BY created_at DESC"
        
        cursor.execute(query, params)
        rows = cursor.fetchall()
        
        employees = [dict(row) for row in rows]
        conn.close()
        
        return jsonify({
            'success': True,
            'data': employees,
            'count': len(employees)
        }), 200
        
    except Exception as e:
        logger.error(f"Error fetching employees: {str(e)}")
        raise APIError("Failed to fetch employees", 500)


@app.route('/api/employees/<employee_id>', methods=['GET'])
def get_employee(employee_id):
    """Get single employee with attendance stats"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        cursor.execute("SELECT * FROM employees WHERE employee_id = ?", (employee_id,))
        row = cursor.fetchone()
        
        if not row:
            raise APIError(f"Employee {employee_id} not found", 404)
        
        employee = dict(row)
        
        # Get attendance stats
        cursor.execute("""
            SELECT 
                COUNT(*) as days_present,
                COUNT(CASE WHEN check_out IS NULL THEN 1 END) as missed_checkout
            FROM daily_attendance 
            WHERE employee_id = ?
        """, (employee_id,))
        
        stats = cursor.fetchone()
        employee['attendance_stats'] = dict(stats) if stats else {}
        
        # Get recent attendance
        cursor.execute("""
            SELECT * FROM daily_attendance 
            WHERE employee_id = ?
            ORDER BY date DESC
            LIMIT 10
        """, (employee_id,))
        
        recent = [dict(row) for row in cursor.fetchall()]
        employee['recent_attendance'] = recent
        
        conn.close()
        
        return jsonify({
            'success': True,
            'data': employee
        }), 200
        
    except APIError:
        raise
    except Exception as e:
        logger.error(f"Error fetching employee: {str(e)}")
        raise APIError("Failed to fetch employee", 500)


@app.route('/api/employees/register', methods=['POST'])
def register_employee():
    """Register new employee"""
    try:
        data = request.json
        
        # Validate required fields
        required = ['employee_id', 'name', 'position']
        for field in required:
            if not data.get(field):
                raise APIError(f"Missing required field: {field}", 400)
        
        # Validate employee_id format (alphanumeric)
        if not data['employee_id'].replace('_', '').replace('-', '').isalnum():
            raise APIError("Invalid employee ID format", 400)
        
        conn = get_db()
        cursor = conn.cursor()
        
        # Check duplicate
        cursor.execute("SELECT employee_id FROM employees WHERE employee_id = ?", 
                      (data['employee_id'],))
        if cursor.fetchone():
            conn.close()
            raise APIError(f"Employee ID '{data['employee_id']}' already exists", 409)
        
        # Insert employee
        cursor.execute("""
            INSERT INTO employees 
            (employee_id, name, email, phone, department, position, date_joined)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            data['employee_id'],
            data['name'],
            data.get('email'),
            data.get('phone'),
            data.get('department', 'General'),
            data['position'],
            datetime.now().strftime('%Y-%m-%d')
        ))
        
        conn.commit()
        conn.close()
        
        # Sync to device
        device_result = hikvision.add_employee({
            'employee_id': data['employee_id'],
            'name': data['name']
        })
        
        logger.info(f"✅ Employee registered: {data['name']} ({data['employee_id']})")
        
        return jsonify({
            'success': True,
            'message': 'Employee registered successfully',
            'data': {
                'employee_id': data['employee_id'],
                'name': data['name'],
                'device_synced': device_result.get('success', False)
            }
        }), 201
        
    except APIError:
        raise
    except sqlite3.IntegrityError as e:
        raise APIError("Database integrity error", 400)
    except Exception as e:
        logger.error(f"Registration error: {str(e)}")
        raise APIError("Registration failed", 500)


@app.route('/api/employees/<employee_id>', methods=['PUT'])
def update_employee(employee_id):
    """Update employee details"""
    try:
        data = request.json
        conn = get_db()
        cursor = conn.cursor()
        
        cursor.execute("SELECT * FROM employees WHERE employee_id = ?", (employee_id,))
        if not cursor.fetchone():
            conn.close()
            raise APIError("Employee not found", 404)
        
        # Build update query
        fields = []
        values = []
        
        for field in ['name', 'email', 'phone', 'department', 'position']:
            if field in data:
                fields.append(f"{field} = ?")
                values.append(data[field])
        
        if fields:
            values.append(employee_id)
            query = f"UPDATE employees SET {', '.join(fields)} WHERE employee_id = ?"
            cursor.execute(query, values)
            conn.commit()
        
        conn.close()
        
        return jsonify({
            'success': True,
            'message': 'Employee updated successfully'
        }), 200
        
    except APIError:
        raise
    except Exception as e:
        logger.error(f"Update error: {str(e)}")
        raise APIError("Failed to update employee", 500)


@app.route('/api/employees/<employee_id>', methods=['DELETE'])
def delete_employee(employee_id):
    """Deactivate employee"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        cursor.execute("SELECT * FROM employees WHERE employee_id = ?", (employee_id,))
        if not cursor.fetchone():
            conn.close()
            raise APIError("Employee not found", 404)
        
        cursor.execute(
            "UPDATE employees SET status = 'inactive' WHERE employee_id = ?",
            (employee_id,)
        )
        conn.commit()
        conn.close()
        
        # Remove from device
        hikvision.delete_employee(employee_id)
        
        logger.info(f"✅ Employee deactivated: {employee_id}")
        
        return jsonify({
            'success': True,
            'message': 'Employee deactivated successfully'
        }), 200
        
    except APIError:
        raise
    except Exception as e:
        logger.error(f"Delete error: {str(e)}")
        raise APIError("Failed to delete employee", 500)


# ============================================
# ATTENDANCE ROUTES
# ============================================

# !!! CRITICAL FIX: Changed route to /event and added Multipart Support !!!
@app.route('/event', methods=['POST'])
def receive_attendance_event():
    """Receive scan event from Hikvision device"""
    try:
        data = None

        # 1. Handle Multipart Data (FIX for 415 Error)
        if request.form:
            event_log = request.form.get('event_log')
            if event_log:
                try:
                    data = json.loads(event_log)
                except json.JSONDecodeError:
                    pass # Keep data as None if parsing fails
        
        # 2. Handle Standard JSON (Fallback)
        elif request.is_json:
            data = request.json
        
        # 3. Filter Heartbeats (Fix for empty looping)
        # If we still have no data, it's likely a heartbeat or invalid request
        if not data:
            # Return 200 OK so the device knows we are alive, but do nothing
            return jsonify({'success': True, 'message': 'Heartbeat ignored'}), 200

        # 4. Process Real Data
        if 'AccessControllerEvent' not in data:
            # Some heartbeats might come as JSON but without the Event key
            return jsonify({'success': True, 'message': 'No Access Event found'}), 200
        
        event = data['AccessControllerEvent']
        employee_id = event.get('employeeNoString', 'Unknown')
        name = event.get('name', 'Unknown')
        
        # Get detailed verification mode
        sub_type = event.get('subEventType', 0)
        verify_mode = get_verify_mode(sub_type)
        
        # Ignore unknown users or door logs
        if name == 'Unknown' or employee_id == 'Unknown':
            return jsonify({'success': True, 'message': 'Ignored unknown user'}), 200
        
        now = datetime.now()
        scan_time = now.strftime('%Y-%m-%d %H:%M:%S')
        today_date = now.strftime('%Y-%m-%d')
        current_time = now.strftime('%H:%M:%S')
        
        conn = get_db()
        cursor = conn.cursor()
        
        # 1. Save to logs
        cursor.execute("""
            INSERT INTO attendance_logs (employee_id, name, verify_mode, scan_time)
            VALUES (?, ?, ?, ?)
        """, (employee_id, name, verify_mode, scan_time))
        
        # 2. Update daily attendance
        cursor.execute(
            "SELECT check_in FROM daily_attendance WHERE employee_id = ? AND date = ?",
            (employee_id, today_date)
        )
        existing = cursor.fetchone()
        
        action = ""
        
        if not existing:
            # First scan = check-in
            cursor.execute("""
                INSERT INTO daily_attendance (employee_id, name, date, check_in, status)
                VALUES (?, ?, ?, ?, 'present')
            """, (employee_id, name, today_date, current_time))
            logger.info(f"✅ CHECK-IN: {name} at {current_time}")
            action = "check_in"
            
        else:
            # Second scan = check-out
            check_in_time = datetime.strptime(existing['check_in'], '%H:%M:%S')
            check_out_time = datetime.strptime(current_time, '%H:%M:%S')
            duration = check_out_time - check_in_time
            
            hours = duration.total_seconds() / 3600
            hours_str = str(duration).split('.')[0] # Remove microseconds
            
            cursor.execute("""
                UPDATE daily_attendance 
                SET check_out = ?, total_hours = ?
                WHERE employee_id = ? AND date = ?
            """, (current_time, hours_str, employee_id, today_date))
            
            logger.info(f"✅ CHECK-OUT: {name} at {current_time} (Duration: {hours_str})")
            action = "check_out"
        
        conn.commit()
        conn.close()
        
        return jsonify({
            'success': True,
            'message': 'Event processed successfully',
            'data': {
                'employee_id': employee_id,
                'name': name,
                'action': action,
                'time': current_time
            }
        }), 200
        
    except Exception as e:
        # Don't crash the server, just log the error
        logger.error(f"Event processing error: {str(e)}")
        # Return 200 anyway so device doesn't retry frantically
        return jsonify({'success': False, 'message': 'Processed with error'}), 200


@app.route('/api/attendance/daily', methods=['GET'])
def get_daily_attendance():
    """Get daily attendance summary"""
    try:
        date = request.args.get('date', datetime.now().strftime('%Y-%m-%d'))
        
        conn = get_db()
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT * FROM daily_attendance 
            WHERE date = ?
            ORDER BY check_in DESC
        """, (date,))
        
        rows = cursor.fetchall()
        attendance = [dict(row) for row in rows]
        
        conn.close()
        
        return jsonify({
            'success': True,
            'data': attendance,
            'count': len(attendance),
            'date': date
        }), 200
        
    except Exception as e:
        logger.error(f"Error fetching daily attendance: {str(e)}")
        raise APIError("Failed to fetch attendance", 500)


@app.route('/api/attendance/logs', methods=['GET'])
def get_attendance_logs():
    """Get recent attendance logs"""
    try:
        limit = int(request.args.get('limit', 100))
        employee_id = request.args.get('employee_id', '')
        
        conn = get_db()
        cursor = conn.cursor()
        
        query = "SELECT * FROM attendance_logs"
        params = []
        
        if employee_id:
            query += " WHERE employee_id = ?"
            params.append(employee_id)
        
        query += " ORDER BY id DESC LIMIT ?"
        params.append(limit)
        
        cursor.execute(query, params)
        rows = cursor.fetchall()
        
        logs = [dict(row) for row in rows]
        conn.close()
        
        return jsonify({
            'success': True,
            'data': logs,
            'count': len(logs)
        }), 200
        
    except Exception as e:
        logger.error(f"Error fetching logs: {str(e)}")
        raise APIError("Failed to fetch logs", 500)


@app.route('/api/attendance/missed-checkout', methods=['GET'])
def get_missed_checkout():
    """Get employees who missed checkout"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        today = datetime.now().strftime('%Y-%m-%d')
        
        cursor.execute("""
            SELECT * FROM daily_attendance 
            WHERE date = ? AND check_out IS NULL
            ORDER BY check_in
        """, (today,))
        
        rows = cursor.fetchall()
        missed = [dict(row) for row in rows]
        
        conn.close()
        
        return jsonify({
            'success': True,
            'data': missed,
            'count': len(missed)
        }), 200
        
    except Exception as e:
        logger.error(f"Error fetching missed checkouts: {str(e)}")
        raise APIError("Failed to fetch missed checkouts", 500)


@app.route('/api/attendance/manual-checkout', methods=['POST'])
def manual_checkout():
    """Manually checkout an employee"""
    try:
        data = request.json
        employee_id = data.get('employee_id')
        checkout_time = data.get('checkout_time', datetime.now().strftime('%H:%M:%S'))
        date = data.get('date', datetime.now().strftime('%Y-%m-%d'))
        
        if not employee_id:
            raise APIError("Employee ID required", 400)
        
        conn = get_db()
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT check_in FROM daily_attendance 
            WHERE employee_id = ? AND date = ?
        """, (employee_id, date))
        
        row = cursor.fetchone()
        if not row:
            conn.close()
            raise APIError("No check-in found for this employee", 404)
        
        # Calculate duration
        check_in_time = datetime.strptime(row['check_in'], '%H:%M:%S')
        check_out_dt = datetime.strptime(checkout_time, '%H:%M:%S')
        duration = check_out_dt - check_in_time
        
        cursor.execute("""
            UPDATE daily_attendance 
            SET check_out = ?, total_hours = ?, is_auto_checkout = 1
            WHERE employee_id = ? AND date = ?
        """, (checkout_time, str(duration), employee_id, date))
        
        conn.commit()
        conn.close()
        
        logger.info(f"✅ Manual checkout: {employee_id} at {checkout_time}")
        
        return jsonify({
            'success': True,
            'message': 'Manual checkout recorded'
        }), 200
        
    except APIError:
        raise
    except Exception as e:
        logger.error(f"Manual checkout error: {str(e)}")
        raise APIError("Failed to record checkout", 500)


# ============================================
# DASHBOARD ROUTES
# ============================================

@app.route('/api/dashboard/stats', methods=['GET'])
def get_dashboard_stats():
    """Get dashboard statistics"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        today = datetime.now().strftime('%Y-%m-%d')
        
        # Total employees
        cursor.execute("SELECT COUNT(*) as total FROM employees WHERE status = 'active'")
        total_employees = cursor.fetchone()['total']
        
        # Present today
        cursor.execute("SELECT COUNT(*) as present FROM daily_attendance WHERE date = ?", (today,))
        present_today = cursor.fetchone()['present']
        
        # Missed checkout
        cursor.execute("""
            SELECT COUNT(*) as missed 
            FROM daily_attendance 
            WHERE date = ? AND check_out IS NULL
        """, (today,))
        missed_checkout = cursor.fetchone()['missed']
        
        # Recent scans (last 20)
        cursor.execute("""
            SELECT * FROM attendance_logs 
            ORDER BY id DESC 
            LIMIT 20
        """)
        recent_scans = [dict(row) for row in cursor.fetchall()]
        
        # Today's attendance list
        cursor.execute("""
            SELECT * FROM daily_attendance 
            WHERE date = ?
            ORDER BY check_in DESC
        """, (today,))
        todays_attendance = [dict(row) for row in cursor.fetchall()]
        
        conn.close()
        
        return jsonify({
            'success': True,
            'data': {
                'total_employees': total_employees,
                'present_today': present_today,
                'absent_today': total_employees - present_today,
                'missed_checkout': missed_checkout,
                'recent_scans': recent_scans,
                'todays_attendance': todays_attendance
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Error fetching dashboard stats: {str(e)}")
        raise APIError("Failed to fetch dashboard stats", 500)


# ============================================
# SYSTEM ROUTES
# ============================================

@app.route('/api/system/health', methods=['GET'])
def health_check():
    """System health check"""
    device_status = hikvision.check_status()
    
    return jsonify({
        'success': True,
        'data': {
            'backend': 'running',
            'database': 'connected',
            'device': 'connected' if device_status['success'] else 'disconnected',
            'mock_mode': hikvision.mock_mode,
            'timestamp': datetime.now().isoformat()
        }
    }), 200


@app.route('/api/system/departments', methods=['GET'])
def get_departments():
    """Get unique departments"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        cursor.execute("SELECT DISTINCT department FROM employees WHERE status = 'active' ORDER BY department")
        rows = cursor.fetchall()
        
        departments = [row['department'] for row in rows]
        conn.close()
        
        return jsonify({
            'success': True,
            'data': departments
        }), 200
        
    except Exception as e:
        raise APIError("Failed to fetch departments", 500)


# ============================================
# HELPER FUNCTIONS
# ============================================

def get_verify_mode(code):
    """Convert event code to readable mode"""
    modes = {
        38: "Fingerprint",
        75: "Face",
        76: "Face",
        1: "Card",
        25: "Card"
    }
    return modes.get(code, f"Code-{code}")


# ============================================
# MAIN
# ============================================

if __name__ == '__main__':
    # Initialize database
    init_db()
    
    PORT = int(os.getenv('PORT', 8080))
    
    print("\n" + "="*60)
    print("🚀 HIKVISION EMS SERVER STARTING")
    print("="*60)
    print(f"Server URL: http://localhost:{PORT}")
    print(f"Mode: {'MOCK DEVICE' if hikvision.mock_mode else 'REAL DEVICE'}")
    print(f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("="*60 + "\n")
    app.run(host='0.0.0.0', port=PORT, debug=True)