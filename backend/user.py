"""
Auto-Sync Service for Hikvision Device
Continuously syncs employee data from device to database
Runs in background thread
"""

import requests
from requests.auth import HTTPDigestAuth
import sqlite3
import time
from datetime import datetime
import threading
import logging
import os
from dotenv import load_dotenv

load_dotenv()

# ==========================================
# CONFIGURATION
# ==========================================

DEVICE_IP = os.getenv('DEVICE_IP', '192.168.31.102')
DEVICE_PORT = os.getenv('DEVICE_PORT', '80')
USERNAME = os.getenv('DEVICE_USER', 'admin')
PASSWORD = os.getenv('DEVICE_PASS', 'Pranesh@232000')
MOCK_MODE = os.getenv('MOCK_MODE', 'false').lower() == 'true'

# Database file (Must match app.py)
DB_NAME = "attendance.db"

# Sync interval (seconds)
SYNC_INTERVAL = 60  # Sync every 60 seconds

# Logging Setup
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [SYNC] %(message)s'
)
logger = logging.getLogger("UserSync")

# ==========================================
# DATABASE HELPER
# ==========================================

def get_db_connection():
    """Connect to the shared database with timeout to prevent locking"""
    try:
        conn = sqlite3.connect(DB_NAME, timeout=20)
        conn.row_factory = sqlite3.Row
        return conn
    except Exception as e:
        logger.error(f"❌ Database connection failed: {e}")
        return None

# ==========================================
# DEVICE COMMUNICATION
# ==========================================

def fetch_users_from_device():
    """
    Fetch all users from Hikvision device
    
    Returns:
        list of user dicts or None on error
    """
    if MOCK_MODE:
        logger.info("🎭 MOCK MODE: Skipping device sync")
        return []
    
    try:
        base_url = f"http://{DEVICE_IP}"
        if DEVICE_PORT != '80':
            base_url += f":{DEVICE_PORT}"
        
        url = f"{base_url}/ISAPI/AccessControl/UserInfo/Search?format=json"
        
        payload = {
            "UserInfoSearchCond": {
                "searchID": "1",
                "maxResults": 1000,
                "searchResultPosition": 0
            }
        }
        
        response = requests.post(
            url,
            auth=HTTPDigestAuth(USERNAME, PASSWORD),
            json=payload,
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            
            if "UserInfoSearch" in data and "UserInfo" in data["UserInfoSearch"]:
                users = data["UserInfoSearch"]["UserInfo"]
                logger.info(f"📡 Device: Found {len(users)} users")
                return users
            else:
                logger.info("⚠️ Device: No users found")
                return []
        else:
            logger.error(f"❌ Device API Error: Status {response.status_code}")
            return None
            
    except requests.exceptions.Timeout:
        logger.error("❌ Device: Connection timeout")
        return None
    except requests.exceptions.ConnectionError:
        logger.error("❌ Device: Cannot connect (check IP and network)")
        return None
    except Exception as e:
        logger.error(f"❌ Device error: {str(e)}")
        return None

# ==========================================
# SYNC LOGIC
# ==========================================

def sync_now():
    """
    Performs a single sync operation: Device -> Database
    
    Returns:
        bool: True if sync succeeded, False otherwise
    """
    try:
        # Step 1: Fetch users from device
        users = fetch_users_from_device()
        
        if users is None:
            logger.warning("⚠️ Sync skipped: Device unavailable")
            return False
        
        if len(users) == 0:
            logger.info("✅ Sync complete: No users on device")
            return True
        
        # Step 2: Connect to database
        conn = get_db_connection()
        if not conn:
            logger.error("❌ Sync failed: Database unavailable")
            return False
        
        cursor = conn.cursor()
        
        # Step 3: Ensure table exists (safety check)
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
        
        # Step 4: Sync each user
        synced_count = 0
        updated_count = 0
        
        for user in users:
            emp_id = user.get("employeeNo")
            name = user.get("name", "Unknown")
            
            if not emp_id:
                continue
            
            # Check if user exists
            cursor.execute("SELECT id, name FROM employees WHERE employee_id = ?", (emp_id,))
            existing = cursor.fetchone()
            
            if existing:
                # Update name if changed
                if existing['name'] != name:
                    cursor.execute(
                        "UPDATE employees SET name = ? WHERE employee_id = ?",
                        (name, emp_id)
                    )
                    updated_count += 1
                    logger.info(f"🔄 Updated: {emp_id} -> {name}")
            else:
                # Insert new employee
                cursor.execute("""
                    INSERT INTO employees 
                    (employee_id, name, department, position, status, date_joined)
                    VALUES (?, ?, 'General', 'Staff', 'active', ?)
                """, (emp_id, name, datetime.now().strftime('%Y-%m-%d')))
                synced_count += 1
                logger.info(f"➕ Added: {emp_id} -> {name}")
        
        conn.commit()
        conn.close()
        
        # Step 5: Report results
        if synced_count > 0 or updated_count > 0:
            logger.info(f"✅ Sync Complete: {synced_count} added, {updated_count} updated")
        else:
            logger.info("✅ Sync Complete: All users up-to-date")
        
        return True
        
    except sqlite3.Error as e:
        logger.error(f"❌ Database error during sync: {e}")
        return False
    except Exception as e:
        logger.error(f"❌ Unexpected error during sync: {e}")
        return False

def sync_with_retry(max_retries=3):
    """
    Sync with automatic retry on failure
    
    Args:
        max_retries: Maximum number of retry attempts
    """
    for attempt in range(1, max_retries + 1):
        success = sync_now()
        
        if success:
            return True
        
        if attempt < max_retries:
            wait_time = attempt * 5  # Progressive backoff: 5s, 10s, 15s
            logger.warning(f"⏳ Retrying sync in {wait_time} seconds (Attempt {attempt}/{max_retries})...")
            time.sleep(wait_time)
    
    logger.error(f"❌ Sync failed after {max_retries} attempts")
    return False

# ==========================================
# BACKGROUND SERVICE
# ==========================================

def start_auto_sync():
    """
    Runs the sync loop in the background indefinitely
    Called by app.py as a daemon thread
    """
    logger.info("🚀 Auto-Sync Service Started")
    logger.info(f"📡 Device: {DEVICE_IP}:{DEVICE_PORT}")
    logger.info(f"🔄 Sync Interval: {SYNC_INTERVAL} seconds")
    logger.info(f"🎭 Mock Mode: {'ENABLED' if MOCK_MODE else 'DISABLED'}")
    logger.info("="*60)
    
    # Initial sync on startup
    logger.info("🔄 Running initial sync...")
    sync_with_retry()
    
    # Continuous sync loop
    while True:
        try:
            time.sleep(SYNC_INTERVAL)
            logger.info("🔄 Starting scheduled sync...")
            sync_with_retry()
            
        except KeyboardInterrupt:
            logger.info("⏹️ Auto-Sync stopped by user")
            break
        except Exception as e:
            logger.error(f"❌ Critical error in sync loop: {e}")
            time.sleep(10)  # Wait before retrying

# ==========================================
# MANUAL SYNC ENDPOINT (OPTIONAL)
# ==========================================

def manual_sync():
    """
    Trigger a manual sync (can be called from API endpoint)
    
    Returns:
        dict with sync results
    """
    logger.info("🔧 Manual sync triggered")
    success = sync_with_retry()
    
    return {
        'success': success,
        'timestamp': datetime.now().isoformat(),
        'message': 'Sync completed successfully' if success else 'Sync failed'
    }

# ==========================================
# STANDALONE MODE (FOR TESTING)
# ==========================================

if __name__ == "__main__":
    """
    Run this file directly for testing:
    python user.py
    """
    print("\n" + "="*60)
    print("🧪 RUNNING IN STANDALONE TEST MODE")
    print("="*60)
    print("Press Ctrl+C to stop\n")
    
    try:
        start_auto_sync()
    except KeyboardInterrupt:
        print("\n✅ Sync service stopped")
