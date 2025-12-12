import React, { useState, useEffect } from 'react';
import { dashboardAPI, attendanceAPI } from '../services/api';
import { eventService } from '../services/eventService';
import {
  Users,
  UserCheck,
  UserX,
  AlertCircle,
  RefreshCw,
  Clock,
  Fingerprint,
  Smartphone,
  Activity,
  Wifi,
  Calendar,
  ChevronLeft,
  ChevronRight,
  TrendingUp
} from 'lucide-react';
import { toast } from 'react-toastify';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [dateAttendance, setDateAttendance] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [connected, setConnected] = useState(false);

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

  const fetchDateAttendance = async (date) => {
    try {
      const response = await attendanceAPI.getDaily(date);
      setDateAttendance(response.data.data);
    } catch (error) {
      console.error('Error fetching date attendance:', error);
    }
  };

  useEffect(() => {
    // Initial fetch
    fetchStats();
    fetchDateAttendance(selectedDate);

    // Connect to live event stream
    eventService.connect();
    setConnected(true);

    // Listen for attendance scan events
    const handleScan = (data) => {
      console.log('🔔 New scan:', data);
      
      // Show toast based on attendance_status from device
      const statusText = data.attendance_status === 'checkIn' ? 'Checked In' : 'Checked Out';
      toast.info(`${data.name} - ${statusText}`, { icon: '👤' });
      
      fetchStats(); // Refresh stats
      
      // If scan is for selected date, refresh that too
      const today = new Date().toISOString().split('T')[0];
      if (selectedDate === today) {
        fetchDateAttendance(selectedDate);
      }
    };

    // Listen for employee added
    const handleEmployeeAdded = (data) => {
      console.log('🔔 Employee added:', data);
      toast.success(`${data.name} registered`);
      fetchStats();
    };

    // Listen for employee deleted
    const handleEmployeeDeleted = (data) => {
      console.log('🔔 Employee deleted:', data);
      fetchStats();
    };

    eventService.on('attendance_scan', handleScan);
    eventService.on('employee_added', handleEmployeeAdded);
    eventService.on('employee_deleted', handleEmployeeDeleted);

    // Cleanup
    return () => {
      eventService.off('attendance_scan', handleScan);
      eventService.off('employee_added', handleEmployeeAdded);
      eventService.off('employee_deleted', handleEmployeeDeleted);
    };
  }, []);

  // Fetch attendance when date changes
  useEffect(() => {
    fetchDateAttendance(selectedDate);
  }, [selectedDate]);

  const getVerifyIcon = (mode) => {
    if (mode?.toLowerCase().includes('finger')) return <Fingerprint className="w-4 h-4" />;
    if (mode?.toLowerCase().includes('face')) return <Smartphone className="w-4 h-4" />;
    return <Activity className="w-4 h-4" />;
  };

  const formatDuration = (duration) => {
    if (!duration || duration === '0:00:00') return '-';
    const parts = duration.split(':');
    return `${parts[0]}h ${parts[1]}m`;
  };

  const formatTime = (time) => {
    if (!time) return '-';
    return time; // Already in HH:MM:SS format
  };

  const changeDate = (days) => {
    const current = new Date(selectedDate);
    current.setDate(current.getDate() + days);
    setSelectedDate(current.toISOString().split('T')[0]);
  };

  const getStatusBadge = (record) => {
    // Check for anomalies first
    if (record.anomaly_type) {
      const anomalyLabels = {
        'missing_checkout': 'Missing Checkout',
        'checkout_without_checkin': 'No Check-In',
        'multiple_checkins': 'Multiple Check-Ins',
        'late_checkout': 'Night Shift'
      };
      return (
        <span className="px-2 py-1 text-xs rounded-full bg-yellow-100 text-yellow-800 border border-yellow-300">
          ⚠️ {anomalyLabels[record.anomaly_type] || 'Anomaly'}
        </span>
      );
    }

    // Normal status badges
    if (record.check_out) {
      return (
        <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800 border border-green-300">
          ✅ Completed
        </span>
      );
    } else if (record.check_in) {
      return (
        <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800 border border-blue-300">
          🔵 Working
        </span>
      );
    }

    return (
      <span className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-800">
        {record.status || 'Unknown'}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600 mt-1">Real-time attendance monitoring</p>
        </div>
        <div className="flex items-center gap-3">
          {connected && (
            <span className="flex items-center gap-2 text-sm text-green-600">
              <Wifi className="w-4 h-4" />
              Live
            </span>
          )}
          <button
            onClick={() => fetchStats(true)}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Total Employees */}
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Employees</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">
                {stats?.total_employees || 0}
              </p>
            </div>
            <div className="bg-blue-100 p-3 rounded-lg">
              <Users className="w-8 h-8 text-blue-600" />
            </div>
          </div>
        </div>

        {/* Present Today */}
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Present Today</p>
              <p className="text-3xl font-bold text-green-600 mt-2">
                {stats?.present_today || 0}
              </p>
            </div>
            <div className="bg-green-100 p-3 rounded-lg">
              <UserCheck className="w-8 h-8 text-green-600" />
            </div>
          </div>
        </div>

        {/* Absent Today */}
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Absent Today</p>
              <p className="text-3xl font-bold text-red-600 mt-2">
                {stats?.absent_today || 0}
              </p>
            </div>
            <div className="bg-red-100 p-3 rounded-lg">
              <UserX className="w-8 h-8 text-red-600" />
            </div>
          </div>
        </div>

        {/* Anomalies (replaced Missed Checkout) */}
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Anomalies Today</p>
              <p className="text-3xl font-bold text-yellow-600 mt-2">
                {stats?.anomaly_count || 0}
              </p>
            </div>
            <div className="bg-yellow-100 p-3 rounded-lg">
              <AlertCircle className="w-8 h-8 text-yellow-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Scans */}
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900">Recent Scans</h2>
            <Activity className="w-5 h-5 text-gray-400" />
          </div>
          
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {stats?.recent_scans && stats.recent_scans.length > 0 ? (
              stats.recent_scans.map((scan, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition">
                  <div className="flex items-center gap-3">
                    <div className="bg-blue-100 p-2 rounded-lg">
                      {getVerifyIcon(scan.verify_mode)}
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">{scan.name}</p>
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

        {/* Today's Active Employees */}
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900">Currently Working</h2>
            <TrendingUp className="w-5 h-5 text-gray-400" />
          </div>
          
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {stats?.todays_attendance && stats.todays_attendance.filter(a => !a.check_out).length > 0 ? (
              stats.todays_attendance.filter(a => !a.check_out).map((att, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <div>
                    <p className="font-semibold text-gray-900">{att.name}</p>
                    <p className="text-sm text-gray-500">{att.employee_id}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-500">Check-in</p>
                    <p className="text-sm font-medium text-blue-600">{att.check_in}</p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-center text-gray-500 py-8">No one currently working</p>
            )}
          </div>
        </div>
      </div>

      {/* Date Selector and Attendance Table */}
      <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-900">Attendance Records</h2>
          
          {/* Date Navigation */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => changeDate(-1)}
              className="p-2 hover:bg-gray-100 rounded-lg transition"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            
            <div className="flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-lg">
              <Calendar className="w-4 h-4 text-gray-600" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-transparent border-none outline-none cursor-pointer"
              />
            </div>
            
            <button
              onClick={() => changeDate(1)}
              disabled={selectedDate >= new Date().toISOString().split('T')[0]}
              className="p-2 hover:bg-gray-100 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-green-50 p-4 rounded-lg border border-green-200">
            <p className="text-sm text-gray-600">Present</p>
            <p className="text-2xl font-bold text-green-600">{dateAttendance.length}</p>
          </div>
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
            <p className="text-sm text-gray-600">Completed</p>
            <p className="text-2xl font-bold text-blue-600">
              {dateAttendance.filter(a => a.check_out).length}
            </p>
          </div>
          <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
            <p className="text-sm text-gray-600">Working/Issues</p>
            <p className="text-2xl font-bold text-yellow-600">
              {dateAttendance.filter(a => !a.check_out || a.anomaly_type).length}
            </p>
          </div>
        </div>

        {/* Attendance Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Employee</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Check In</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Check Out</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Duration</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Status</th>
              </tr>
            </thead>
            <tbody>
              {dateAttendance.length > 0 ? (
                dateAttendance.map((record, idx) => (
                  <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4">
                      <div>
                        <p className="font-semibold text-gray-900">{record.name}</p>
                        <p className="text-sm text-gray-500">{record.employee_id}</p>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-gray-900">{formatTime(record.check_in)}</span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-gray-900">{formatTime(record.check_out) || 'Working...'}</span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-medium text-blue-600">{formatDuration(record.total_hours)}</span>
                    </td>
                    <td className="py-3 px-4">
                      {getStatusBadge(record)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5" className="text-center py-8 text-gray-500">
                    No attendance records for {selectedDate}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
