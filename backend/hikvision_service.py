"""
Hikvision Device Communication Service
"""
import requests
from requests.auth import HTTPDigestAuth
import os
from dotenv import load_dotenv

load_dotenv()

class HikvisionService:
    def __init__(self):
        self.mock_mode = os.getenv('MOCK_MODE', 'true').lower() == 'true'
        self.device_ip = os.getenv('DEVICE_IP', 'localhost')
        self.device_port = os.getenv('DEVICE_PORT', '5000')
        self.username = os.getenv('DEVICE_USER', 'admin')
        self.password = os.getenv('DEVICE_PASS', 'admin123')
        self.base_url = f"http://{self.device_ip}:{self.device_port}"
        
        mode_str = "MOCK MODE" if self.mock_mode else f"REAL DEVICE ({self.device_ip})"
        print(f"🔧 Hikvision Service: {mode_str}")
    
    def add_employee(self, employee_data):
        """Add employee to device"""
        if self.mock_mode:
            print(f"🎭 MOCK: Adding employee {employee_data['name']}")
            return {'success': True, 'mock': True}
        
        try:
            url = f"{self.base_url}/ISAPI/AccessControl/UserInfo/Record"
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
                timeout=5
            )
            
            return {'success': response.status_code == 200}
            
        except Exception as e:
            print(f"❌ Device error: {str(e)}")
            return {'success': False, 'error': str(e)}
    
    def delete_employee(self, employee_id):
        """Remove employee from device"""
        if self.mock_mode:
            print(f"🎭 MOCK: Deleting employee {employee_id}")
            return {'success': True, 'mock': True}
        
        try:
            url = f"{self.base_url}/ISAPI/AccessControl/UserInfo/Delete"
            payload = {
                "UserInfoDelCond": {
                    "EmployeeNoList": [{"employeeNo": employee_id}]
                }
            }
            
            response = requests.put(
                url,
                auth=HTTPDigestAuth(self.username, self.password),
                json=payload,
                timeout=5
            )
            
            return {'success': response.status_code == 200}
            
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def check_status(self):
        """Check device connectivity"""
        if self.mock_mode:
            return {'success': True, 'mock': True, 'status': 'Mock device active'}
        
        try:
            url = f"{self.base_url}/ISAPI/System/status"
            response = requests.get(
                url,
                auth=HTTPDigestAuth(self.username, self.password),
                timeout=3
            )
            return {'success': response.status_code == 200}
        except:
            return {'success': False, 'error': 'Device unreachable'}
