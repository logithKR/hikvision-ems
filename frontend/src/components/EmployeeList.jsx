import React, { useState, useEffect } from 'react';
import { employeeAPI } from '../services/api';
import { eventService } from '../services/eventService';
import { toast } from 'react-toastify';
import { 
  Search, 
  UserX, 
  Trash2,
  RefreshCw,
  Wifi
} from 'lucide-react';

export default function EmployeeList() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [connected, setConnected] = useState(false);

  const fetchEmployees = async () => {
    setLoading(true);
    try {
      const params = {
        status: statusFilter,
        department: departmentFilter,
        search: searchTerm
      };
      
      const response = await employeeAPI.getAll(params);
      setEmployees(response.data.data);
    } catch (error) {
      console.error('Error fetching employees:', error);
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
      toast.success(`${data.name} added to system`);
      fetchEmployees(); // Only refresh when employee is added
    };

    // Listen for employee deleted event
    const handleEmployeeDeleted = (data) => {
      console.log('🔔 Employee deleted:', data);
      toast.info('Employee deactivated');
      fetchEmployees(); // Only refresh when employee is deleted
    };

    eventService.on('employee_added', handleEmployeeAdded);
    eventService.on('employee_deleted', handleEmployeeDeleted);

    // Cleanup
    return () => {
      eventService.off('employee_added', handleEmployeeAdded);
      eventService.off('employee_deleted', handleEmployeeDeleted);
    };
  }, [statusFilter, departmentFilter]);

  const handleDelete = async (employeeId, name) => {
    if (!window.confirm(`Are you sure you want to deactivate ${name}?`)) {
      return;
    }

    try {
      await employeeAPI.delete(employeeId);
      toast.success('Employee deactivated successfully');
      // No need to manually refresh - event will trigger it
    } catch (error) {
      console.error('Error deleting employee:', error);
    }
  };

  const filteredEmployees = employees.filter(emp => 
    emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    emp.employee_id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Employees</h1>
          <p className="text-gray-500 mt-1">Manage employee records</p>
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
        </div>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Search by name or ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-field pl-10"
            />
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="input-field"
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>

          {/* Refresh */}
          <button
            onClick={fetchEmployees}
            className="btn-secondary flex items-center justify-center space-x-2"
          >
            <RefreshCw size={18} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Employee Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          </div>
        ) : filteredEmployees.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Employee
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Contact
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Department
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Position
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredEmployees.map((employee) => (
                  <tr key={employee.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {employee.name}
                        </div>
                        <div className="text-sm text-gray-500">
                          {employee.employee_id}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{employee.email || '-'}</div>
                      <div className="text-sm text-gray-500">{employee.phone || '-'}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="badge badge-info">{employee.department}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {employee.position}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`badge ${
                        employee.status === 'active' ? 'badge-success' : 'badge-gray'
                      }`}>
                        {employee.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => handleDelete(employee.employee_id, employee.name)}
                        className="text-red-600 hover:text-red-900 ml-4"
                        title="Deactivate"
                      >
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12">
            <UserX className="mx-auto text-gray-400 mb-4" size={48} />
            <p className="text-gray-500">No employees found</p>
          </div>
        )}
      </div>

      {/* Stats Footer */}
      <div className="card">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-600">
            Showing <span className="font-medium">{filteredEmployees.length}</span> employees
          </p>
          {connected && (
            <div className="flex items-center space-x-2 text-green-600">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-xs font-medium">Live updates enabled</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
