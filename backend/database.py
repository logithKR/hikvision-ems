"""
Database Setup and Connection
Optimized for Hikvision EMS with Attendance Status Tracking
"""

import sqlite3
from datetime import datetime

DB_FILE = 'attendance.db'

def init_db():
    """Initialize database with the 3 essential tables"""
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    # ==========================================
    # TABLE 1: EMPLOYEES (Master List)
    # ==========================================
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS employees (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            employee_id TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            email TEXT,
            phone TEXT,
            department TEXT DEFAULT 'General',
            position TEXT DEFAULT 'Staff',
            status TEXT DEFAULT 'active',
            date_joined DATE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # ==========================================
    # TABLE 2: ATTENDANCE LOGS (Raw Event History)
    # ==========================================
    # Stores EVERY scan with the explicit status from device
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS attendance_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            employee_id TEXT NOT NULL,
            name TEXT,
            attendance_status TEXT,
            verify_mode TEXT,
            scan_time TIMESTAMP NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # ==========================================
    # TABLE 3: DAILY ATTENDANCE (Processed Summary)
    # ==========================================
    # One record per employee per day with anomaly tracking
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS daily_attendance (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            employee_id TEXT NOT NULL,
            name TEXT,
            date DATE NOT NULL,
            
            check_in TIME,
            check_out TIME,
            
            total_hours TEXT DEFAULT '0:00:00',
            
            status TEXT DEFAULT 'present',
            anomaly_type TEXT,
            
            is_manual_edit INTEGER DEFAULT 0,
            notes TEXT,
            
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            
            UNIQUE(employee_id, date)
        )
    ''')
    
    # ==========================================
    # PERFORMANCE INDEXES
    # ==========================================
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_emp_id ON employees(employee_id)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_att_date ON daily_attendance(date)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_att_emp_date ON daily_attendance(employee_id, date)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_logs_time ON attendance_logs(scan_time)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_logs_status ON attendance_logs(attendance_status)')
    
    conn.commit()
    conn.close()
    print("✅ Database initialized successfully with new structure")

def get_db():
    """Get database connection with row factory for dict-like access"""
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn
