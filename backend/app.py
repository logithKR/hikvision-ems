"""
Hikvision EMS Backend API with Server-Sent Events (SSE)
Updated to handle explicit Check-In/Check-Out status from device
WITH PROPER ANOMALY DETECTION
"""

from flask import Flask, request, jsonify, Response
from flask_cors import CORS
import sqlite3
import json
from datetime import datetime, timedelta
import logging
from database import init_db, get_db
from hikvision_service import HikvisionService
import os
from dotenv import load_dotenv
import queue
import threading

# --- IMPORT THE NEW SYNC MODULE ---
import user  # This imports your user.py file

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

# SSE notification system
notification_queues = []
notification_lock = threading.Lock()


def broadcast_event(event_type, data):
    """Broadcast event to all connected SSE clients"""
    message = json.dumps({
        'type': event_type,
        'data': data,
        'timestamp': datetime.now().isoformat()
    })
    
    with notification_lock:
        dead_queues = []
        for q in notification_queues:
            try:
                q.put(message)
            except:
                dead_queues.append(q)
        
        # Remove dead queues
        for q in dead_queues:
            notification_queues.remove(q)
    
    logger.info(f"📡 Broadcasted event: {event_type}")


# ============================================
# SSE ENDPOINT
# ============================================

@app.route('/api/events/stream')
def event_stream():
    """Server-Sent Events endpoint for live updates"""
    def generate():
        q = queue.Queue()
        with notification_lock:
            notification_queues.append(q)
        
        try:
            # Send initial connection message
            yield f"data: {json.dumps({'type': 'connected', 'message': 'Connected to live stream'})}\n\n"
            
            while True:
                message = q.get()
                yield f"data: {message}\n\n"
        except GeneratorExit:
            with notification_lock:
                if q in notification_queues:
                    notification_queues.remove(q)
    
    return Response(generate(), mimetype='text/event-stream')


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
        
        status = request.args.get('status')
        search = request.args.get('search', '')
        department = request.args.get('department', '')
        
        query = "SELECT * FROM employees WHERE 1=1"
        params = []
        
        if status:
            query += " AND status = ?"
            params.append(status)
        
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
                SUM(CASE WHEN anomaly_type IS NOT NULL THEN 1 ELSE 0 END) as anomaly_count
            FROM daily_attendance 
            WHERE employee_id = ?
        """, (employee_id,))
        
        stats = cursor.fetchone()
        
        # Get monthly hours (current month)
        now = datetime.now()
        first_day = now.replace(day=1).strftime('%Y-%m-%d')
        
        cursor.execute("""
            SELECT total_hours
            FROM daily_attendance
            WHERE employee_id = ?
            AND date >= ?
            AND check_out IS NOT NULL
        """, (employee_id, first_day))
        
        monthly_records = cursor.fetchall()
        
        # Calculate monthly total
        total_seconds = 0
        for record in monthly_records:
            if record['total_hours'] and record['total_hours'] != '0:00:00':
                try:
                    parts = record['total_hours'].split(':')
                    hours = int(parts[0])
                    minutes = int(parts[1])
                    seconds = int(parts[2]) if len(parts) > 2 else 0
                    total_seconds += hours * 3600 + minutes * 60 + seconds
                except:
                    pass
        
        total_hours = total_seconds // 3600
        total_minutes = (total_seconds % 3600) // 60
        monthly_total = f"{total_hours}h {total_minutes}m"
        
        employee['attendance_stats'] = {
            'days_present': stats['days_present'] or 0,
            'anomaly_count': stats['anomaly_count'] or 0,
            'monthly_hours': monthly_total
        }
        
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
        required = ['employee_id', 'name']
        for field in required:
            if not data.get(field):
                raise APIError(f"Missing required field: {field}", 400)
        
        # Validate employee_id format
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
            data.get('position', 'Staff'),
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
        
        # Broadcast event
        broadcast_event('employee_added', {
            'employee_id': data['employee_id'],
            'name': data['name'],
            'department': data.get('department', 'General')
        })
        
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
    except sqlite3.IntegrityError:
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
        
        # Broadcast event
        broadcast_event('employee_deleted', {'employee_id': employee_id})
        
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
# ATTENDANCE ROUTES (FIXED LOGIC)
# ============================================

@app.route('/event', methods=['POST'])
def receive_attendance_event():
    """
    Receive scan event from Hikvision device
    WITH PROPER CHECKOUT WITHOUT CHECKIN DETECTION
    """
    try:
        data = None
        
        # 1. Handle Multipart Data
        if request.form:
            event_log = request.form.get('event_log')
            if event_log:
                try:
                    data = json.loads(event_log)
                except json.JSONDecodeError:
                    pass
        
        # 2. Handle Standard JSON
        elif request.is_json:
            data = request.json
        
        # 3. Filter Heartbeats
        if not data:
            return jsonify({'success': True, 'message': 'Heartbeat ignored'}), 200
        
        # 4. Process Real Event
        if 'AccessControllerEvent' not in data:
            return jsonify({'success': True, 'message': 'No Access Event found'}), 200
        
        event = data['AccessControllerEvent']
        
        employee_id = event.get('employeeNoString', 'Unknown')
        name = event.get('name', 'Unknown')
        attendance_status = event.get('attendanceStatus', 'unknown')
        
        # Get verification mode
        sub_type = event.get('subEventType', 0)
        verify_mode = get_verify_mode(sub_type)
        
        # Ignore unknown users
        if name == 'Unknown' or employee_id == 'Unknown':
            return jsonify({'success': True, 'message': 'Ignored unknown user'}), 200
        
        now = datetime.now()
        scan_time = now.strftime('%Y-%m-%d %H:%M:%S')
        today_date = now.strftime('%Y-%m-%d')
        current_time = now.strftime('%H:%M:%S')
        
        conn = get_db()
        cursor = conn.cursor()
        
        # 1. ALWAYS save to attendance_logs (Raw history)
        cursor.execute("""
            INSERT INTO attendance_logs (employee_id, name, attendance_status, verify_mode, scan_time)
            VALUES (?, ?, ?, ?, ?)
        """, (employee_id, name, attendance_status, verify_mode, scan_time))
        
        # 2. Process based on attendanceStatus
        action_taken = process_attendance_status(
            cursor, employee_id, name, attendance_status, today_date, current_time
        )
        
        conn.commit()
        conn.close()
        
        # Broadcast event
        broadcast_event('attendance_scan', {
            'employee_id': employee_id,
            'name': name,
            'attendance_status': attendance_status,
            'verify_mode': verify_mode,
            'scan_time': scan_time,
            'action': action_taken
        })
        
        return jsonify({
            'success': True,
            'message': 'Event processed successfully',
            'data': {
                'employee_id': employee_id,
                'name': name,
                'status': attendance_status,
                'action': action_taken,
                'time': current_time
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Event processing error: {str(e)}")
        return jsonify({'success': False, 'message': 'Processed with error'}), 200


def process_attendance_status(cursor, employee_id, name, attendance_status, date, time):
    """
    Process attendance based on explicit status from device
    FIXED: Properly detects checkout without checkin
    """
    
    # Get today's record if exists
    cursor.execute("""
        SELECT * FROM daily_attendance 
        WHERE employee_id = ? AND date = ?
    """, (employee_id, date))
    
    existing = cursor.fetchone()
    
    # ====== SCENARIO 1: CHECK IN ======
    if attendance_status.lower() == 'checkin':
        if not existing:
            # First check-in of the day - NORMAL
            cursor.execute("""
                INSERT INTO daily_attendance (employee_id, name, date, check_in, status)
                VALUES (?, ?, ?, ?, 'present')
            """, (employee_id, name, date, time))
            logger.info(f"✅ CHECK-IN: {name} at {time}")
            return 'check_in'
        
        elif existing['check_out'] is None:
            # Already checked in, no checkout yet - UPDATE check-in time
            cursor.execute("""
                UPDATE daily_attendance 
                SET check_in = ?, updated_at = CURRENT_TIMESTAMP
                WHERE employee_id = ? AND date = ?
            """, (time, employee_id, date))
            logger.warning(f"⚠️ DUPLICATE CHECK-IN: {name} at {time} (Updated)")
            return 'check_in_updated'
        
        else:
            # Already completed (check-in + check-out) - Could be second shift
            logger.warning(f"⚠️ MULTIPLE SHIFTS: {name} checked in again after completing day")
            return 'multiple_checkin'
    
    # ====== SCENARIO 2: CHECK OUT ======
    elif attendance_status.lower() == 'checkout':
        
        # **KEY FIX: Check if NO record exists at all**
        if not existing:
            # ❌ ANOMALY: Checkout without any check-in record
            cursor.execute("""
                INSERT INTO daily_attendance 
                (employee_id, name, date, check_in, check_out, total_hours, status, anomaly_type)
                VALUES (?, ?, ?, NULL, ?, '0:00:00', 'incomplete', 'checkout_without_checkin')
            """, (employee_id, name, date, time))
            logger.warning(f"❌ ANOMALY: {name} checked out WITHOUT checking in! Time: {time}")
            return 'anomaly_checkout_without_checkin'
        
        # Record exists - check if it has check_in
        elif existing['check_in'] is None:
            # Has record but no check-in (edge case) - ANOMALY
            cursor.execute("""
                UPDATE daily_attendance 
                SET check_out = ?, 
                    total_hours = '0:00:00',
                    anomaly_type = 'checkout_without_checkin',
                    status = 'incomplete',
                    updated_at = CURRENT_TIMESTAMP
                WHERE employee_id = ? AND date = ?
            """, (time, employee_id, date))
            logger.warning(f"⚠️ ANOMALY: {name} checkout without checkin (edge case)")
            return 'anomaly_checkout_without_checkin'
        
        # Normal case - has check_in
        elif existing['check_out'] is None:
            # Normal checkout - Calculate duration
            check_in_time = datetime.strptime(existing['check_in'], '%H:%M:%S')
            check_out_time = datetime.strptime(time, '%H:%M:%S')
            
            # Handle night shift (checkout next day)
            anomaly_type = None
            if check_out_time < check_in_time:
                check_out_time += timedelta(days=1)
                anomaly_type = 'late_checkout'
            
            duration = check_out_time - check_in_time
            hours_str = str(duration).split('.')[0]  # Format: HH:MM:SS
            
            cursor.execute("""
                UPDATE daily_attendance 
                SET check_out = ?, 
                    total_hours = ?,
                    anomaly_type = ?,
                    status = 'present',
                    updated_at = CURRENT_TIMESTAMP
                WHERE employee_id = ? AND date = ?
            """, (time, hours_str, anomaly_type, employee_id, date))
            
            logger.info(f"✅ CHECK-OUT: {name} at {time} (Duration: {hours_str})")
            return 'check_out'
        
        else:
            # Already checked out - duplicate
            logger.warning(f"⚠️ DUPLICATE CHECK-OUT: {name} at {time} (Ignored)")
            return 'duplicate_checkout'
    
    # ====== SCENARIO 3: Unknown Status ======
    else:
        logger.warning(f"⚠️ Unknown attendance status: {attendance_status}")
        return 'unknown_status'


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


@app.route('/api/attendance/anomalies', methods=['GET'])
def get_anomalies():
    """Get all records with anomalies for a specific date"""
    try:
        date = request.args.get('date', datetime.now().strftime('%Y-%m-%d'))
        
        conn = get_db()
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT * FROM daily_attendance 
            WHERE date = ? AND anomaly_type IS NOT NULL
            ORDER BY created_at DESC
        """, (date,))
        
        rows = cursor.fetchall()
        anomalies = [dict(row) for row in rows]
        
        conn.close()
        
        return jsonify({
            'success': True,
            'data': anomalies,
            'count': len(anomalies),
            'date': date
        }), 200
        
    except Exception as e:
        logger.error(f"Error fetching anomalies: {str(e)}")
        raise APIError("Failed to fetch anomalies", 500)


@app.route('/api/attendance/manual-checkout', methods=['POST'])
def manual_checkout():
    """Manually record checkout for employee"""
    try:
        data = request.json
        employee_id = data.get('employee_id')
        checkout_time = data.get('checkout_time')
        date = data.get('date', datetime.now().strftime('%Y-%m-%d'))
        
        if not employee_id or not checkout_time:
            raise APIError("Missing employee_id or checkout_time", 400)
        
        conn = get_db()
        cursor = conn.cursor()
        
        # Get record
        cursor.execute("""
            SELECT * FROM daily_attendance
            WHERE employee_id = ? AND date = ?
        """, (employee_id, date))
        
        record = cursor.fetchone()
        
        if not record:
            raise APIError("No attendance record found for this date", 404)
        
        if record['check_in']:
            # Calculate duration
            check_in_time = datetime.strptime(record['check_in'], '%H:%M:%S')
            check_out_time = datetime.strptime(checkout_time, '%H:%M:%S')
            
            if check_out_time < check_in_time:
                check_out_time += timedelta(days=1)
            
            duration = check_out_time - check_in_time
            duration_str = str(duration).split('.')[0]
            
            cursor.execute("""
                UPDATE daily_attendance
                SET check_out = ?, total_hours = ?, anomaly_type = NULL, status = 'present'
                WHERE employee_id = ? AND date = ?
            """, (checkout_time, duration_str, employee_id, date))
        else:
            cursor.execute("""
                UPDATE daily_attendance
                SET check_out = ?, total_hours = '0:00:00'
                WHERE employee_id = ? AND date = ?
            """, (checkout_time, employee_id, date))
        
        conn.commit()
        conn.close()
        
        # Broadcast
        broadcast_event('manual_checkout', {
            'employee_id': employee_id,
            'date': date,
            'checkout_time': checkout_time
        })
        
        return jsonify({
            'success': True,
            'message': 'Manual checkout recorded'
        }), 200
        
    except APIError:
        raise
    except Exception as e:
        logger.error(f"Manual checkout error: {str(e)}")
        raise APIError("Failed to record manual checkout", 500)


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
        
        # Total ACTIVE employees
        cursor.execute("SELECT COUNT(*) as total FROM employees WHERE status = 'active'")
        total_employees = cursor.fetchone()['total']
        
        # Present today
        cursor.execute("""
            SELECT COUNT(*) as present 
            FROM daily_attendance da
            INNER JOIN employees e ON da.employee_id = e.employee_id
            WHERE da.date = ? AND e.status = 'active'
        """, (today,))
        present_today = cursor.fetchone()['present']
        
        absent_today = max(0, total_employees - present_today)
        
        # Anomalies today
        cursor.execute("""
            SELECT COUNT(*) as anomalies
            FROM daily_attendance
            WHERE date = ? AND anomaly_type IS NOT NULL
        """, (today,))
        anomaly_count = cursor.fetchone()['anomalies']
        
        # Recent scans
        cursor.execute("""
            SELECT * FROM attendance_logs 
            ORDER BY id DESC 
            LIMIT 20
        """)
        recent_scans = [dict(row) for row in cursor.fetchall()]
        
        # Today's attendance
        cursor.execute("""
            SELECT da.* FROM daily_attendance da
            INNER JOIN employees e ON da.employee_id = e.employee_id
            WHERE da.date = ? AND e.status = 'active'
            ORDER BY da.check_in DESC
        """, (today,))
        todays_attendance = [dict(row) for row in cursor.fetchall()]
        
        conn.close()
        
        return jsonify({
            'success': True,
            'data': {
                'total_employees': total_employees,
                'present_today': present_today,
                'absent_today': absent_today,
                'anomaly_count': anomaly_count,
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
            'timestamp': datetime.now().isoformat(),
            'connected_clients': len(notification_queues)
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
    
    # Start user sync thread
    sync_thread = threading.Thread(target=user.start_auto_sync, daemon=True)
    sync_thread.start()
    
    PORT = int(os.getenv('PORT', 8080))
    
    print("\n" + "="*60)
    print("🚀 HIKVISION EMS SERVER STARTING")
    print("="*60)
    print(f"Server URL: http://localhost:{PORT}")
    print(f"SSE Stream: http://localhost:{PORT}/api/events/stream")
    print(f"Mode: {'MOCK DEVICE' if hikvision.mock_mode else 'REAL DEVICE'}")
    print(f"Auto-Sync: ENABLED (Background)")
    print(f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("="*60 + "\n")
    
    app.run(host='0.0.0.0', port=PORT, debug=True, threaded=True)
