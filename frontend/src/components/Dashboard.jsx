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
  ChevronRight
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
      toast.info(`${data.name} - ${data.action === 'check_in' ? 'Checked In' : 'Checked Out'}`);
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
    if (mode?.toLowerCase().includes('finger')) return <Fingerprint size={16} />;
    if (mode?.toLowerCase().includes('face')) return <Smartphone size={16} />;
    return <Clock size={16} />;
  };

  const formatDuration = (duration) => {
    if (!duration || duration === '0:00:00') return '-';
    const parts = duration.split(':');
    return `${parts[0]}h ${parts[1]}m`;
  };

  const changeDate = (days) => {
    const currentDate = new Date(selectedDate);
    currentDate.setDate(currentDate.getDate() + days);
    setSelectedDate(currentDate.toISOString().split('T')[0]);
  };

  const goToToday = () => {
    setSelectedDate(new Date().toISOString().split('T')[0]);
  };

  const isToday = selectedDate === new Date().toISOString().split('T')[0];

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
        <div className="flex items-center space-x-3">
          {/* Live indicator */}
          <div className={`flex items-center space-x-2 px-4 py-2 rounded-lg ${
            connected ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
          }`}>
            <Wifi size={18} className={connected ? 'animate-pulse' : ''} />
            <span className="text-sm font-medium">
              {connected ? 'Live' : 'Disconnected'}
            </span>
          </div>
          
          {/* Manual refresh */}
          <button
            onClick={() => fetchStats(true)}
            disabled={refreshing}
            className="btn-primary flex items-center space-x-2"
          >
            <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>
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
            <div className="flex items-center space-x-2">
              {connected && (
                <div className="flex items-center space-x-1">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <span className="text-xs text-green-600 font-medium">Live</span>
                </div>
              )}
              <span className="badge badge-info">{stats?.recent_scans?.length || 0} scans</span>
            </div>
          </div>
          
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {stats?.recent_scans?.length > 0 ? (
              stats.recent_scans.map((scan) => (
                <div 
                  key={scan.id} 
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors animate-slide-up"
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

        {/* Today's Attendance Summary */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900">Today's Summary</h2>
            <span className="badge badge-success">{stats?.todays_attendance?.length || 0} present</span>
          </div>
          
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

      {/* Date-wise Attendance Detail */}
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <Calendar className="text-primary" size={24} />
            <h2 className="text-xl font-semibold text-gray-900">Date-wise Attendance</h2>
          </div>
          
          {/* Date Navigation */}
          <div className="flex items-center space-x-2">
            <button
              onClick={() => changeDate(-1)}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              title="Previous Day"
            >
              <ChevronLeft size={20} />
            </button>
            
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="input-field text-center font-medium"
              style={{ width: '160px' }}
            />
            
            <button
              onClick={() => changeDate(1)}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              title="Next Day"
            >
              <ChevronRight size={20} />
            </button>

            {!isToday && (
              <button
                onClick={goToToday}
                className="btn-secondary text-sm ml-2"
              >
                Today
              </button>
            )}
          </div>
        </div>

        {/* Date Statistics */}
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="p-4 bg-green-50 rounded-lg border border-green-200">
            <p className="text-sm text-green-600 font-medium">Present</p>
            <p className="text-2xl font-bold text-green-700 mt-1">
              {dateAttendance.length}
            </p>
          </div>
          <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-sm text-blue-600 font-medium">Checked Out</p>
            <p className="text-2xl font-bold text-blue-700 mt-1">
              {dateAttendance.filter(a => a.check_out).length}
            </p>
          </div>
          <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
            <p className="text-sm text-yellow-600 font-medium">Still In</p>
            <p className="text-2xl font-bold text-yellow-700 mt-1">
              {dateAttendance.filter(a => !a.check_out).length}
            </p>
          </div>
        </div>

        {/* Attendance Table */}
        <div className="overflow-x-auto">
          {dateAttendance.length > 0 ? (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Employee
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Check In
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Check Out
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Duration
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {dateAttendance.map((record) => (
                  <tr key={record.id} className="hover:bg-gray-50 animate-slide-up">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{record.name}</div>
                      <div className="text-sm text-gray-500">{record.employee_id}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-medium text-green-600">
                        {record.check_in || '-'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`text-sm font-medium ${
                        record.check_out ? 'text-blue-600' : 'text-yellow-600'
                      }`}>
                        {record.check_out || 'Pending'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatDuration(record.total_hours)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="badge badge-success">
                        {record.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="text-center py-12">
              <UserX className="mx-auto text-gray-400 mb-4" size={48} />
              <p className="text-gray-500">No attendance records for {selectedDate}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
