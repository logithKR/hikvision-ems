import React, { useState, useEffect } from 'react';
import { dashboardAPI } from '../services/api';
import { 
  Users, 
  UserCheck, 
  UserX, 
  AlertCircle, 
  RefreshCw,
  Clock,
  Fingerprint,
  Smartphone
} from 'lucide-react';
import { toast } from 'react-toastify';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStats = async (showToast = false) => {
    try {
      if (showToast) setRefreshing(true);
      const response = await dashboardAPI.getStats();
      setStats(response.data.data);
      if (showToast) toast.success('Dashboard refreshed');
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(() => fetchStats(), 30000); // Auto-refresh every 30s
    return () => clearInterval(interval);
  }, []);

  const getVerifyIcon = (mode) => {
    if (mode?.toLowerCase().includes('finger')) return <Fingerprint size={16} />;
    if (mode?.toLowerCase().includes('face')) return <Smartphone size={16} />;
    return <Clock size={16} />;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 mt-1">Real-time attendance monitoring</p>
        </div>
        <button
          onClick={() => fetchStats(true)}
          disabled={refreshing}
          className="btn-primary flex items-center space-x-2"
        >
          <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="stat-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Employees</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">
                {stats?.total_employees || 0}
              </p>
            </div>
            <div className="p-3 bg-blue-100 rounded-lg">
              <Users className="text-primary" size={24} />
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Present Today</p>
              <p className="text-3xl font-bold text-green-600 mt-2">
                {stats?.present_today || 0}
              </p>
            </div>
            <div className="p-3 bg-green-100 rounded-lg">
              <UserCheck className="text-green-600" size={24} />
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Absent Today</p>
              <p className="text-3xl font-bold text-red-600 mt-2">
                {stats?.absent_today || 0}
              </p>
            </div>
            <div className="p-3 bg-red-100 rounded-lg">
              <UserX className="text-red-600" size={24} />
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Missed Checkout</p>
              <p className="text-3xl font-bold text-yellow-600 mt-2">
                {stats?.missed_checkout || 0}
              </p>
            </div>
            <div className="p-3 bg-yellow-100 rounded-lg">
              <AlertCircle className="text-yellow-600" size={24} />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Scans */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900">Recent Scans</h2>
            <span className="badge badge-info">Live</span>
          </div>
          
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {stats?.recent_scans?.length > 0 ? (
              stats.recent_scans.map((scan) => (
                <div 
                  key={scan.id} 
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-white rounded-lg shadow-sm">
                      {getVerifyIcon(scan.verify_mode)}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{scan.name}</p>
                      <p className="text-sm text-gray-500">{scan.employee_id}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-gray-900">
                      {new Date(scan.scan_time).toLocaleTimeString('en-US', {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </p>
                    <p className="text-xs text-gray-500">{scan.verify_mode}</p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-center text-gray-500 py-8">No recent scans</p>
            )}
          </div>
        </div>

        {/* Today's Attendance */}
        <div className="card">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Today's Attendance</h2>
          
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {stats?.todays_attendance?.length > 0 ? (
              stats.todays_attendance.map((att) => (
                <div 
                  key={att.id} 
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div>
                    <p className="font-medium text-gray-900">{att.name}</p>
                    <p className="text-sm text-gray-500">{att.employee_id}</p>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center space-x-2 mb-1">
                      <span className="text-xs text-gray-500">In:</span>
                      <span className="text-sm font-medium text-green-600">
                        {att.check_in || '-'}
                      </span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-xs text-gray-500">Out:</span>
                      <span className={`text-sm font-medium ${att.check_out ? 'text-blue-600' : 'text-gray-400'}`}>
                        {att.check_out || 'Pending'}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-center text-gray-500 py-8">No attendance records today</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
