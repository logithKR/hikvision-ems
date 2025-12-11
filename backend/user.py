import requests
from requests.auth import HTTPDigestAuth
import sqlite3
import time
from datetime import datetime
import threading
import logging

# ==========================================
# CONFIGURATION
# ==========================================
DEVICE_IP = "192.168.31.102"
USERNAME = "admin"
PASSWORD = "Pranesh@232000"  # Your Device Password

# Database file (Must match app.py)
DB_NAME = "attendance.db"
SYNC_INTERVAL = 30  # Auto-sync every 30 seconds

# Logging Setup
logging.basicConfig(level=logging.INFO, format='%(asctime)s [SYNC] %(message)s')
logger = logging.getLogger("UserSync")

# ==========================================
# SYNC LOGIC
# ==========================================

def get_db_connection():
    """Connect to the shared database with timeout to prevent locking"""
    conn = sqlite3.connect(DB_NAME, timeout=20)
    conn.row_factory = sqlite3.Row
    return conn

def sync_now():
    """Performs a single sync operation: Device -> DB"""
    url = f"http://{DEVICE_IP}/ISAPI/AccessControl/UserInfo/Search?format=json"
    payload = {
        "UserInfoSearchCond": {
            "searchID": "1",
            "maxResults": 1000,
            "searchResultPosition": 0
        }
    }

    try:
        # 1. Fetch Users from Device
        response = requests.post(url, auth=HTTPDigestAuth(USERNAME, PASSWORD), json=payload, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            
            if "UserInfoSearch" in data and "UserInfo" in data["UserInfoSearch"]:
                users = data["UserInfoSearch"]["UserInfo"]
                logger.info(f"📡 Device found {len(users)} users. Syncing to DB...")

                conn = get_db_connection()
                cursor = conn.cursor()
                
                # Ensure table exists (Safety check)
                cursor.execute('''
                    CREATE TABLE IF NOT EXISTS employees (
                        employee_id TEXT PRIMARY KEY,
                        name TEXT,
                        email TEXT,
                        phone TEXT,
                        department TEXT,
                        position TEXT,
                        date_joined TEXT,
                        status TEXT
                    )
                ''')

                count = 0
                for user in users:
                    emp_id = user.get("employeeNo")
                    name = user.get("name")
                    
                    # 2. Insert or Update User (ID & Name ONLY)
                    # We use defaults for other fields so app.py doesn't crash
                    cursor.execute("""
                        INSERT INTO employees (employee_id, name, department, position, status, date_joined)
                        VALUES (?, ?, 'General', 'Staff', 'active', ?)
                        ON CONFLICT(employee_id) DO UPDATE SET 
                            name=excluded.name
                    """, (emp_id, name, datetime.now().strftime('%Y-%m-%d')))
                    count += 1

                conn.commit()
                conn.close()
                logger.info(f"✅ Sync Complete. Processed {count} users.")
                return True
            else:
                logger.info("⚠️ No users found on device.")
        else:
            logger.error(f"❌ Device Error: {response.status_code}")

    except Exception as e:
        logger.error(f"❌ Connection Failed: {e}")
    
    return False

def start_auto_sync():
    """Runs the sync loop in the background"""
    logger.info("🚀 Auto-Sync Service Started (Background)")
    while True:
        sync_now()
        time.sleep(SYNC_INTERVAL)

# Allow running standalone for testing
if __name__ == "__main__":
    start_auto_sync()