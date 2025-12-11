"""
Database Setup and Connection
"""
import sqlite3
from datetime import datetime

DB_FILE = 'attendance.db'

def init_db():
    """Initialize database with all tables"""
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    # 1. EMPLOYEES TABLE
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS employees (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            employee_id TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            email TEXT,
            phone TEXT,
            department TEXT DEFAULT 'General',
            position TEXT NOT NULL,
            status TEXT DEFAULT 'active',
            date_joined DATE,
            biometric_enrolled INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # 2. ATTENDANCE LOGS TABLE
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS attendance_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            employee_id TEXT NOT NULL,
            name TEXT,
            verify_mode TEXT,
            scan_time TIMESTAMP NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # 3. DAILY ATTENDANCE TABLE
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
            is_auto_checkout INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(employee_id, date)
        )
    ''')
    
    # Create indexes for performance
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_emp_id ON employees(employee_id)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_att_date ON daily_attendance(date)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_logs_time ON attendance_logs(scan_time)')
    
    conn.commit()
    conn.close()
    print("✅ Database initialized successfully")

def get_db():
    """Get database connection with row factory"""
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn
