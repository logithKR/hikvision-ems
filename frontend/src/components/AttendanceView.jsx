import React, { useState, useEffect } from 'react';
import { attendanceAPI } from '../services/api';
import { eventService } from '../services/eventService';
import { toast } from 'react-toastify';
import { Calendar, Clock, AlertTriangle, RefreshCw, Wifi, TrendingUp, Activity } from 'lucide-react';

export default function AttendanceView() {
  const [activeTab, setActiveTab] = useState('daily');
  const [dailyAttendance, setDailyAttendance] = useState([]);
  const [logs, setLogs] = useState([]);
  const [anomalies, setAnomalies] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'daily') {
        const response = await attendanceAPI.getDaily(selectedDate);
        setDailyAttendance(response.data.data);
      } else if (activeTab === 'logs') {
        const response = await attendanceAPI.getLogs({ limit: 100 });
        setLogs(response.data.data);
      } else if (activeTab === 'anomalies') {
        const response = await attendanceAPI.getAnomalies(selectedDate);
        setAnomalies(response.data.data);
      }
    } catch (error) {
      console.error('Error fetching attendance:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    // Connect to event stream
    eventService.connect();
    setConnected(true);

    // Listen for attendance scan events
    const handleAttendanceScan = (data) => {
      console.log('🔔 Attendance scan:', data);
      
      // Show appropriate message based on attendance_status
      const statusText = data.attendance_status === 'checkIn' ? 'checked in' : 'checked out';
      toast.info(`${data.name} ${statusText}`, { icon: '👤' });
      
      fetchData(); // Refresh current view
    };

    // Listen for manual checkout events
    const handleManualCheckout = (data) => {
      console.log('🔔 Manual checkout:', data);
      toast.success('Manual checkout recorded');
      fetchData();
    };

    eventService.on('attendance_scan', handleAttendanceScan);
    eventService.on('manual_checkout', handleManualCheckout);

    // Cleanup
    return () => {
      eventService.off('attendance_scan', handleAttendanceScan);
      eventService.off('manual_checkout', handleManualCheckout);
    };
  }, [activeTab, selectedDate]);

  const formatDuration = (duration) => {
    if (!duration || duration === '0:00:00') return '-';
    const parts = duration.split(':');
    return `${parts[0]}h ${parts[1]}m`;
  };

  const formatTime = (time) => {
    if (!time) return '-';
    return time; // Already in HH:MM:SS format
  };

  const getStatusBadge = (record) => {
    // Check for anomalies first
    if (record.anomaly_type) {
      const anomalyConfig = {
        'missing_checkout': { label: 'Missing Checkout', color: 'yellow' },
        'checkout_without_checkin': { label: 'No Check-In', color: 'red' },
        'multiple_checkins': { label: 'Multiple Check-Ins', color: 'orange' },
        'late_checkout': { label: 'Night Shift', color: 'purple' }
      };

      const config = anomalyConfig[record.anomaly_type] || { label: 'Anomaly', color: 'gray' };
      
      return (
        <span className={`px-3 py-1 text-xs rounded-full bg-${config.color}-100 text-${config.color}-800 border border-${config.color}-300 font-medium`}>
          {config.label}
        </span>
      );
    }

    // Normal status badges
    if (record.check_out) {
      return (
        <span className="px-3 py-1 text-xs rounded-full bg-green-100 text-green-800 border border-green-300 font-medium">
          Completed
        </span>
      );
    } else if (record.check_in) {
      return (
        <span className="px-3 py-1 text-xs rounded-full bg-blue-100 text-blue-800 border border-blue-300 font-medium">
          Working
        </span>
      );
    }

    return (
      <span className="px-3 py-1 text-xs rounded-full bg-gray-100 text-gray-800 font-medium">
        {record.status || 'Unknown'}
      </span>
    );
  };

  const getAttendanceStatusBadge = (status) => {
    if (status?.toLowerCase() === 'checkin') {
      return (
        <span className="px-3 py-1 text-xs rounded-full bg-green-100 text-green-800 border border-green-300 font-medium">
          Check In
        </span>
      );
    } else if (status?.toLowerCase() === 'checkout') {
      return (
        <span className="px-3 py-1 text-xs rounded-full bg-red-100 text-red-800 border border-red-300 font-medium">
          Check Out
        </span>
      );
    }
    return (
      <span className="px-3 py-1 text-xs rounded-full bg-gray-100 text-gray-800 font-medium">
        {status || 'Unknown'}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Attendance Records</h1>
          <p className="text-gray-600 mt-1">Track and manage attendance records</p>
        </div>
        <div className="flex items-center gap-3">
          {connected && (
            <span className="flex items-center gap-2 text-sm text-green-600">
              <Wifi className="w-4 h-4" />
              Live
            </span>
          )}
          <button
            onClick={() => fetchData()}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="border-b border-gray-200">
          <nav className="flex gap-4 px-6">
            <button
              onClick={() => setActiveTab('daily')}
              className={`py-4 px-2 border-b-2 font-medium transition ${
                activeTab === 'daily'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Daily Summary
              </div>
            </button>

            <button
              onClick={() => setActiveTab('logs')}
              className={`py-4 px-2 border-b-2 font-medium transition ${
                activeTab === 'logs'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4" />
                Scan Logs
              </div>
            </button>

            <button
              onClick={() => setActiveTab('anomalies')}
              className={`py-4 px-2 border-b-2 font-medium transition ${
                activeTab === 'anomalies'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Anomalies
                {anomalies.length > 0 && (
                  <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                    {anomalies.length}
                  </span>
                )}
              </div>
            </button>
          </nav>
        </div>

        {/* Date Selector (for daily and anomalies) */}
        {(activeTab === 'daily' || activeTab === 'anomalies') && (
          <div className="p-4 bg-gray-50 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gray-600" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
        )}

        {/* Content */}
        <div className="p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
            </div>
          ) : (
            <>
              {/* Daily Summary Tab */}
              {activeTab === 'daily' && (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-3 px-4 font-semibold text-gray-700">Employee</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-700">Check In</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-700">Check Out</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-700">Total Hours</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-700">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dailyAttendance.length > 0 ? (
                        dailyAttendance.map((record, idx) => (
                          <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                            <td className="py-3 px-4">
                              <div>
                                <p className="font-semibold text-gray-900">{record.name}</p>
                                <p className="text-sm text-gray-500">{record.employee_id}</p>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-gray-900">{formatTime(record.check_in)}</td>
                            <td className="py-3 px-4 text-gray-900">
                              {formatTime(record.check_out) || (
                                <span className="text-blue-600 font-medium">Working...</span>
                              )}
                            </td>
                            <td className="py-3 px-4">
                              <span className="font-semibold text-blue-600">
                                {formatDuration(record.total_hours)}
                              </span>
                            </td>
                            <td className="py-3 px-4">{getStatusBadge(record)}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="5" className="text-center py-12 text-gray-500">
                            No attendance records for this date
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Scan Logs Tab */}
              {activeTab === 'logs' && (
                <div className="space-y-3">
                  {logs.length > 0 ? (
                    logs.map((log, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition border border-gray-200"
                      >
                        <div className="flex items-center gap-4">
                          <div className="bg-blue-100 p-3 rounded-lg">
                            <Clock className="w-5 h-5 text-blue-600" />
                          </div>
                          <div>
                            <p className="font-semibold text-gray-900">{log.name}</p>
                            <p className="text-sm text-gray-500">{log.employee_id}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="text-sm font-medium text-gray-900">
                              {new Date(log.scan_time).toLocaleString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </p>
                            <p className="text-xs text-gray-500">{log.verify_mode}</p>
                          </div>
                          
                          {/* Show attendance status from device */}
                          {getAttendanceStatusBadge(log.attendance_status)}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-12 text-gray-500">
                      No scan logs available
                    </div>
                  )}
                </div>
              )}

              {/* Anomalies Tab */}
              {activeTab === 'anomalies' && (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-3 px-4 font-semibold text-gray-700">Employee</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-700">Date</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-700">Check In</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-700">Check Out</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-700">Issue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {anomalies.length > 0 ? (
                        anomalies.map((record, idx) => (
                          <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                            <td className="py-3 px-4">
                              <div>
                                <p className="font-semibold text-gray-900">{record.name}</p>
                                <p className="text-sm text-gray-500">{record.employee_id}</p>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-gray-900">{record.date}</td>
                            <td className="py-3 px-4 text-gray-900">{formatTime(record.check_in)}</td>
                            <td className="py-3 px-4 text-gray-900">{formatTime(record.check_out)}</td>
                            <td className="py-3 px-4">{getStatusBadge(record)}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="5" className="text-center py-12 text-gray-500">
                            <div className="flex flex-col items-center gap-2">
                              <TrendingUp className="w-12 h-12 text-green-500" />
                              <p className="font-medium">No anomalies found!</p>
                              <p className="text-sm">All attendance records are clean for this date.</p>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
