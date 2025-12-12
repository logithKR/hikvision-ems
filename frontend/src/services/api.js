import axios from 'axios';
import { toast } from 'react-toastify';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

// Create axios instance
const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000,
});

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      const message = error.response.data?.message || 'An error occurred';
      toast.error(message);
    } else if (error.request) {
      toast.error('Network error. Please check your connection');
    } else {
      toast.error('An unexpected error occurred');
    }
    return Promise.reject(error);
  }
);

// ============================================
// EMPLOYEE API
// ============================================
export const employeeAPI = {
  getAll: (params = {}) => api.get('/api/employees', { params }),
  getById: (id) => api.get(`/api/employees/${id}`),
  register: (data) => api.post('/api/employees/register', data),
  update: (id, data) => api.put(`/api/employees/${id}`, data),
  delete: (id) => api.delete(`/api/employees/${id}`),
};

// ============================================
// ATTENDANCE API (UPDATED)
// ============================================
export const attendanceAPI = {
  // Get daily attendance summary
  getDaily: (date) => api.get('/api/attendance/daily', { params: { date } }),
  
  // Get raw attendance logs
  getLogs: (params = {}) => api.get('/api/attendance/logs', { params }),
  
  // NEW: Get attendance anomalies (replaces missed checkout)
  getAnomalies: (date) => api.get('/api/attendance/anomalies', { params: { date } }),
  
  // NEW: Get monthly total hours for an employee
  getMonthlyTotal: (employeeId, year, month) => 
    api.get(`/api/attendance/monthly-total/${employeeId}`, { 
      params: { year, month } 
    }),
  
  // Manual checkout (admin function)
  manualCheckout: (data) => api.post('/api/attendance/manual-checkout', data),
  
  // DEPRECATED: Old endpoint (keeping for backward compatibility)
  getMissedCheckout: () => api.get('/api/attendance/anomalies'),
};

// ============================================
// DASHBOARD API
// ============================================
export const dashboardAPI = {
  getStats: () => api.get('/api/dashboard/stats'),
};

// ============================================
// SYSTEM API
// ============================================
export const systemAPI = {
  health: () => api.get('/api/system/health'),
  getDepartments: () => api.get('/api/system/departments'),
};

export default api;
