import React, { useState, useEffect } from 'react';
import { employeeAPI, systemAPI } from '../services/api';
import { toast } from 'react-toastify';
import { UserPlus, CheckCircle, Loader } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function RegisterEmployee() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [departments, setDepartments] = useState(['IT', 'HR', 'Operations', 'Finance', 'Sales']);
  const [formData, setFormData] = useState({
    employee_id: '',
    name: '',
    email: '',
    phone: '',
    department: 'IT',
    position: ''
  });

  useEffect(() => {
    fetchDepartments();
  }, []);

  const fetchDepartments = async () => {
    try {
      const response = await systemAPI.getDepartments();
      if (response.data.data.length > 0) {
        setDepartments(response.data.data);
      }
    } catch (error) {
      console.error('Error fetching departments:', error);
    }
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validation
    if (!formData.employee_id.trim()) {
      toast.error('Employee ID is required');
      return;
    }
    if (!formData.name.trim()) {
      toast.error('Name is required');
      return;
    }
    if (!formData.position.trim()) {
      toast.error('Position is required');
      return;
    }

    setLoading(true);

    try {
      const response = await employeeAPI.register(formData);
      
      if (response.data.success) {
        toast.success('Employee registered successfully!');
        
        // Reset form
        setFormData({
          employee_id: '',
          name: '',
          email: '',
          phone: '',
          department: 'IT',
          position: ''
        });

        // Redirect after 2 seconds
        setTimeout(() => {
          navigate('/employees');
        }, 2000);
      }
    } catch (error) {
      console.error('Registration error:', error);
      // Error toast is handled by axios interceptor
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto animate-fade-in">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Register Employee</h1>
        <p className="text-gray-500 mt-1">Add new employee to the system</p>
      </div>

      <div className="card">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Employee ID */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Employee ID <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="employee_id"
              value={formData.employee_id}
              onChange={handleChange}
              placeholder="e.g., E001"
              className="input-field"
              required
            />
            <p className="text-xs text-gray-500 mt-1">Unique identifier for the employee</p>
          </div>

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Full Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="e.g., John Doe"
              className="input-field"
              required
            />
          </div>

          {/* Email & Phone */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email
              </label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="john@company.com"
                className="input-field"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Phone
              </label>
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                placeholder="9876543210"
                className="input-field"
              />
            </div>
          </div>

          {/* Department & Position */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Department
              </label>
              <select
                name="department"
                value={formData.department}
                onChange={handleChange}
                className="input-field"
              >
                {departments.map((dept) => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Position <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="position"
                value={formData.position}
                onChange={handleChange}
                placeholder="e.g., Software Engineer"
                className="input-field"
                required
              />
            </div>
          </div>

          {/* Submit Button */}
          <div className="flex items-center space-x-4">
            <button
              type="submit"
              disabled={loading}
              className="btn-primary flex items-center space-x-2 flex-1"
            >
              {loading ? (
                <>
                  <Loader size={20} className="animate-spin" />
                  <span>Registering...</span>
                </>
              ) : (
                <>
                  <UserPlus size={20} />
                  <span>Register Employee</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => navigate('/employees')}
              className="btn-secondary"
            >
              Cancel
            </button>
          </div>
        </form>

        {/* Info Box */}
        <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-start space-x-3">
            <CheckCircle className="text-blue-600 mt-0.5" size={20} />
            <div className="text-sm text-blue-800">
              <p className="font-medium mb-1">After Registration:</p>
              <ul className="list-disc list-inside space-y-1 text-blue-700">
                <li>Employee will be synced to Hikvision device</li>
                <li>Employee can enroll fingerprint/face on the device</li>
                <li>Attendance tracking will be enabled automatically</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
