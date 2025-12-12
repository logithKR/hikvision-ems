"""
Hikvision Device Communication Service
Handles all interactions with the Hikvision access control device
"""

import requests
from requests.auth import HTTPDigestAuth
import os
from dotenv import load_dotenv
import logging

load_dotenv()

logger = logging.getLogger(__name__)

class HikvisionService:
    def __init__(self):
        self.mock_mode = os.getenv('MOCK_MODE', 'true').lower() == 'true'
        self.device_ip = os.getenv('DEVICE_IP', '192.168.31.102')
        self.device_port = os.getenv('DEVICE_PORT', '80')
        self.username = os.getenv('DEVICE_USER', 'admin')
        self.password = os.getenv('DEVICE_PASS', 'admin123')
        self.base_url = f"http://{self.device_ip}"
        
        if self.device_port != '80':
            self.base_url += f":{self.device_port}"
        
        mode_str = "MOCK MODE" if self.mock_mode else f"REAL DEVICE ({self.device_ip})"
        print(f"🔧 Hikvision Service: {mode_str}")
    
    def add_employee(self, employee_data):
        """
        Add employee to device
        
        Args:
            employee_data: dict with 'employee_id' and 'name'
        
        Returns:
            dict with 'success' status
        """
        if self.mock_mode:
            logger.info(f"🎭 MOCK: Adding employee {employee_data['name']} ({employee_data['employee_id']})")
            return {'success': True, 'mock': True}
        
        try:
            url = f"{self.base_url}/ISAPI/AccessControl/UserInfo/Record?format=json"
            
            payload = {
                "UserInfo": {
                    "employeeNo": employee_data['employee_id'],
                    "name": employee_data['name'],
                    "userType": "normal"
                }
            }
            
            response = requests.post(
                url,
                auth=HTTPDigestAuth(self.username, self.password),
                json=payload,
                timeout=10
            )
            
            if response.status_code == 200:
                logger.info(f"✅ Device: Added employee {employee_data['name']}")
                return {'success': True}
            else:
                logger.error(f"❌ Device: Failed to add employee. Status: {response.status_code}")
                return {'success': False, 'error': f"Status code: {response.status_code}"}
                
        except requests.exceptions.Timeout:
            logger.error(f"❌ Device: Connection timeout")
            return {'success': False, 'error': 'Connection timeout'}
        except requests.exceptions.ConnectionError:
            logger.error(f"❌ Device: Cannot connect to device")
            return {'success': False, 'error': 'Cannot connect to device'}
        except Exception as e:
            logger.error(f"❌ Device error: {str(e)}")
            return {'success': False, 'error': str(e)}
    
    def delete_employee(self, employee_id):
        """
        Remove employee from device
        
        Args:
            employee_id: str employee ID to delete
        
        Returns:
            dict with 'success' status
        """
        if self.mock_mode:
            logger.info(f"🎭 MOCK: Deleting employee {employee_id}")
            return {'success': True, 'mock': True}
        
        try:
            url = f"{self.base_url}/ISAPI/AccessControl/UserInfo/Delete?format=json"
            
            payload = {
                "UserInfoDelCond": {
                    "EmployeeNoList": [
                        {"employeeNo": employee_id}
                    ]
                }
            }
            
            response = requests.put(
                url,
                auth=HTTPDigestAuth(self.username, self.password),
                json=payload,
                timeout=10
            )
            
            if response.status_code == 200:
                logger.info(f"✅ Device: Deleted employee {employee_id}")
                return {'success': True}
            else:
                logger.error(f"❌ Device: Failed to delete employee. Status: {response.status_code}")
                return {'success': False, 'error': f"Status code: {response.status_code}"}
                
        except requests.exceptions.Timeout:
            logger.error(f"❌ Device: Connection timeout")
            return {'success': False, 'error': 'Connection timeout'}
        except requests.exceptions.ConnectionError:
            logger.error(f"❌ Device: Cannot connect to device")
            return {'success': False, 'error': 'Cannot connect to device'}
        except Exception as e:
            logger.error(f"❌ Device error: {str(e)}")
            return {'success': False, 'error': str(e)}
    
    def get_all_users(self):
        """
        Fetch all users from device
        
        Returns:
            dict with 'success' and 'users' list
        """
        if self.mock_mode:
            logger.info(f"🎭 MOCK: Fetching all users")
            return {
                'success': True, 
                'mock': True,
                'users': []
            }
        
        try:
            url = f"{self.base_url}/ISAPI/AccessControl/UserInfo/Search?format=json"
            
            payload = {
                "UserInfoSearchCond": {
                    "searchID": "1",
                    "maxResults": 1000,
                    "searchResultPosition": 0
                }
            }
            
            response = requests.post(
                url,
                auth=HTTPDigestAuth(self.username, self.password),
                json=payload,
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                
                if "UserInfoSearch" in data and "UserInfo" in data["UserInfoSearch"]:
                    users = data["UserInfoSearch"]["UserInfo"]
                    logger.info(f"✅ Device: Retrieved {len(users)} users")
                    return {'success': True, 'users': users}
                else:
                    logger.warning("⚠️ Device: No users found")
                    return {'success': True, 'users': []}
            else:
                logger.error(f"❌ Device: Failed to fetch users. Status: {response.status_code}")
                return {'success': False, 'error': f"Status code: {response.status_code}", 'users': []}
                
        except requests.exceptions.Timeout:
            logger.error(f"❌ Device: Connection timeout")
            return {'success': False, 'error': 'Connection timeout', 'users': []}
        except requests.exceptions.ConnectionError:
            logger.error(f"❌ Device: Cannot connect to device")
            return {'success': False, 'error': 'Cannot connect to device', 'users': []}
        except Exception as e:
            logger.error(f"❌ Device error: {str(e)}")
            return {'success': False, 'error': str(e), 'users': []}
    
    def check_status(self):
        """
        Check device connectivity
        
        Returns:
            dict with 'success' status
        """
        if self.mock_mode:
            return {
                'success': True, 
                'mock': True, 
                'status': 'Mock device active'
            }
        
        try:
            url = f"{self.base_url}/ISAPI/System/status"
            
            response = requests.get(
                url,
                auth=HTTPDigestAuth(self.username, self.password),
                timeout=5
            )
            
            if response.status_code == 200:
                logger.info("✅ Device: Connected")
                return {'success': True, 'status': 'Device connected'}
            else:
                logger.warning(f"⚠️ Device: Status check failed. Code: {response.status_code}")
                return {'success': False, 'error': f"Status code: {response.status_code}"}
                
        except requests.exceptions.Timeout:
            logger.error(f"❌ Device: Connection timeout")
            return {'success': False, 'error': 'Connection timeout'}
        except requests.exceptions.ConnectionError:
            logger.error(f"❌ Device: Cannot connect to device")
            return {'success': False, 'error': 'Device unreachable'}
        except Exception as e:
            logger.error(f"❌ Device error: {str(e)}")
            return {'success': False, 'error': str(e)}
    
    def sync_employee_to_device(self, employee_id, name):
        """
        Convenience method to sync a single employee
        
        Args:
            employee_id: str
            name: str
        
        Returns:
            dict with 'success' status
        """
        return self.add_employee({
            'employee_id': employee_id,
            'name': name
        })
