import React, { useState, useEffect } from 'react';
import { employeeAPI } from '../services/api';
import { eventService } from '../services/eventService';
import { toast } from 'react-toastify';
import { 
  Search, 
  UserX, 
  Trash2, 
  RefreshCw, 
  Wifi,
  Calendar
} from 'lucide-react';

export default function EmployeeList() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [connected, setConnected] = useState(false);

  const fetchEmployees = async () => {
    setLoading(true);
    try {
      const params = {
        status: statusFilter === '' ? undefined : statusFilter,
        search: searchTerm
      };
      const response = await employeeAPI.getAll(params);
      setEmployees(response.data.data);
    } catch (error) {
      console.error('Error fetching employees:', error);
      toast.error('Failed to fetch employees');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployees();

    // Connect to event stream
    eventService.connect();
    setConnected(true);

    // Listen for employee added event
    const handleEmployeeAdded = (data) => {
      console.log('🔔 Employee added:', data);
      toast.success(`${data.name} added to system`, { icon: '👤' });
      fetchEmployees();
    };

    // Listen for employee deleted event
    const handleEmployeeDeleted = (data) => {
      console.log('🔔 Employee deleted:', data);
      toast.info('Employee deactivated');
      fetchEmployees();
    };

    eventService.on('employee_added', handleEmployeeAdded);
    eventService.on('employee_deleted', handleEmployeeDeleted);

    // Cleanup
    return () => {
      eventService.off('employee_added', handleEmployeeAdded);
      eventService.off('employee_deleted', handleEmployeeDeleted);
    };
  }, [statusFilter]);

  const handleDelete = async (employeeId, name) => {
    if (!window.confirm(`Are you sure you want to deactivate ${name}?`)) {
      return;
    }

    try {
      await employeeAPI.delete(employeeId);
      toast.success('Employee deactivated successfully');
    } catch (error) {
      console.error('Error deleting employee:', error);
      toast.error('Failed to deactivate employee');
    }
  };

  const filteredEmployees = employees.filter(emp =>
    emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    emp.employee_id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusBadge = (status) => {
    if (status === 'active') {
      return (
        <span className="px-3 py-1 text-xs rounded-full bg-green-100 text-green-800 border border-green-300 font-medium">
          ✓ Active
        </span>
      );
    }
    return (
      <span className="px-3 py-1 text-xs rounded-full bg-gray-100 text-gray-800 border border-gray-300 font-medium">
        ⊘ Inactive
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Employee Management</h1>
          <p className="text-gray-600 mt-1">Manage employee records</p>
        </div>
        <div className="flex items-center gap-3">
          {connected && (
            <span className="flex items-center gap-2 text-sm text-green-600">
              <Wifi className="w-4 h-4" />
              Live
            </span>
          )}
          <button
            onClick={() => fetchEmployees()}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name or ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="active">Active Only</option>
            <option value="inactive">Inactive Only</option>
            <option value="">All Employees</option>
          </select>
        </div>
      </div>

      {/* Employee Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-4 px-6 font-semibold text-gray-700">Employee ID</th>
                    <th className="text-left py-4 px-6 font-semibold text-gray-700">Name</th>
                    <th className="text-left py-4 px-6 font-semibold text-gray-700">Date Joined</th>
                    <th className="text-left py-4 px-6 font-semibold text-gray-700">Status</th>
                    <th className="text-left py-4 px-6 font-semibold text-gray-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEmployees.length > 0 ? (
                    filteredEmployees.map((employee) => (
                      <tr 
                        key={employee.id}
                        className="border-b border-gray-100 hover:bg-gray-50 transition"
                      >
                        <td className="py-4 px-6">
                          <span className="font-mono font-semibold text-gray-900">
                            {employee.employee_id}
                          </span>
                        </td>
                        <td className="py-4 px-6">
                          <p className="font-semibold text-gray-900">{employee.name}</p>
                        </td>
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-gray-400" />
                            <span className="text-gray-600">
                              {employee.date_joined 
                                ? new Date(employee.date_joined).toLocaleDateString('en-US', {
                                    year: 'numeric',
                                    month: 'short',
                                    day: 'numeric'
                                  })
                                : '-'}
                            </span>
                          </div>
                        </td>
                        <td className="py-4 px-6">
                          {getStatusBadge(employee.status)}
                        </td>
                        <td className="py-4 px-6">
                          <button
                            onClick={() => handleDelete(employee.employee_id, employee.name)}
                            className="text-red-600 hover:text-red-800 p-2 hover:bg-red-50 rounded-lg transition"
                            title="Deactivate Employee"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="5" className="text-center py-12">
                        <UserX className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                        <p className="text-gray-500 font-medium">No employees found</p>
                        <p className="text-sm text-gray-400 mt-1">
                          Try adjusting your search or filters
                        </p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div className="bg-gray-50 px-6 py-4 border-t border-gray-200">
              <div className="flex items-center justify-between text-sm">
                <p className="text-gray-600">
                  Showing <span className="font-semibold text-gray-900">{filteredEmployees.length}</span> {statusFilter === '' ? 'total' : statusFilter} employees
                </p>
                {connected && (
                  <div className="flex items-center gap-2 text-green-600">
                    <Wifi className="w-4 h-4" />
                    <span>Real-time updates enabled</span>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
