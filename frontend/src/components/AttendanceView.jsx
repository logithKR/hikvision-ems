import React, { useState, useEffect } from 'react';
import { attendanceAPI } from '../services/api';
import { eventService } from '../services/eventService';
import { toast } from 'react-toastify';
import { Calendar, Clock, AlertTriangle, RefreshCw, Wifi } from 'lucide-react';

export default function AttendanceView() {
  const [activeTab, setActiveTab] = useState('daily');
  const [dailyAttendance, setDailyAttendance] = useState([]);
  const [logs, setLogs] = useState([]);
  const [missedCheckout, setMissedCheckout] = useState([]);
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
        const response = await attendanceAPI.getLogs(100);
        setLogs(response.data.data);
      } else if (activeTab === 'missed') {
        const response = await attendanceAPI.getMissedCheckout();
        setMissedCheckout(response.data.data);
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
      const action = data.action === 'check_in' ? 'checked in' : 'checked out';
      toast.info(`${data.name} ${action}`, {
        icon: '👤'
      });
      fetchData(); // Refresh only when scan happens
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

  const handleManualCheckout = async (employeeId) => {
    if (!window.confirm('Mark manual checkout for this employee?')) return;

    try {
      await attendanceAPI.manualCheckout({
        employee_id: employeeId,
        checkout_time: new Date().toTimeString().split(' ')[0],
        date: selectedDate
      });
      toast.success('Manual checkout recorded');
      // No need to manually refresh - event will trigger it
    } catch (error) {
      console.error('Error with manual checkout:', error);
    }
  };

  const formatDuration = (duration) => {
    if (!duration || duration === '0:00:00') return '-';
    const parts = duration.split(':');
    return `${parts[0]}h ${parts[1]}m`;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Attendance</h1>
          <p className="text-gray-500 mt-1">Track and manage attendance records</p>
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
          <button
            onClick={fetchData}
            className="btn-primary flex items-center space-x-2"
          >
            <RefreshCw size={18} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="card">
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8">
            {[
              { id: 'daily', label: 'Daily Summary', icon: Calendar },
              { id: 'logs', label: 'Scan Logs', icon: Clock },
              { id: 'missed', label: 'Missed Checkout', icon: AlertTriangle }
            ].map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`
                    flex items-center space-x-2 py-4 px-1 border-b-2 font-medium text-sm
                    ${activeTab === tab.id
                      ? 'border-primary text-primary'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }
                  `}
                >
                  <Icon size={18} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Date Selector for Daily */}
        {activeTab === 'daily' && (
          <div className="mt-4 flex items-center justify-between">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="input-field max-w-xs"
            />
            {connected && (
              <div className="flex items-center space-x-2 text-green-600">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-xs font-medium">Updates on scan</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="card">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          </div>
        ) : (
          <>
            {/* Daily Summary */}
            {activeTab === 'daily' && (
              <div className="overflow-x-auto">
                {dailyAttendance.length > 0 ? (
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Check In</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Check Out</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total Hours</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {dailyAttendance.map((record) => (
                        <tr key={record.id} className="hover:bg-gray-50 animate-slide-up">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">{record.name}</div>
                            <div className="text-sm text-gray-500">{record.employee_id}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {record.check_in || '-'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {record.check_out || <span className="text-yellow-600">Pending</span>}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {formatDuration(record.total_hours)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="badge badge-success">{record.status}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-center text-gray-500 py-12">No attendance records for this date</p>
                )}
              </div>
            )}

            {/* Scan Logs */}
            {activeTab === 'logs' && (
              <div className="space-y-3">
                {logs.length > 0 ? (
                  logs.map((log) => (
                    <div key={log.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg animate-slide-up">
                      <div className="flex items-center space-x-4">
                        <div className="flex-shrink-0">
                          <div className="p-2 bg-white rounded-lg shadow-sm">
                            <Clock size={20} className="text-primary" />
                          </div>
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{log.name}</p>
                          <p className="text-sm text-gray-500">{log.employee_id}</p>
                        </div>
                      </div>
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
                    </div>
                  ))
                ) : (
                  <p className="text-center text-gray-500 py-12">No scan logs available</p>
                )}
              </div>
            )}

            {/* Missed Checkout */}
            {activeTab === 'missed' && (
              <div className="overflow-x-auto">
                {missedCheckout.length > 0 ? (
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Check In</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Action</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {missedCheckout.map((record) => (
                        <tr key={record.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">{record.name}</div>
                            <div className="text-sm text-gray-500">{record.employee_id}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {record.check_in}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {record.date}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <button
                              onClick={() => handleManualCheckout(record.employee_id)}
                              className="btn-primary text-sm"
                            >
                              Manual Checkout
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-center text-gray-500 py-12">No missed checkouts</p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
