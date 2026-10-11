'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  getAdminDriversAction,
  createAdminDriverAction,
  updateAdminDriverAction,
  toggleAdminDriverActiveAction,
} from '@/services/admin.service';
import { StatusBadge, Skeleton, EmptyState, Button } from '@bts/ui';

interface DriverItem {
  id: string;
  userId: string;
  name: string | null;
  email: string;
  licenseNumber: string;
  phone: string | null;
  active: boolean;
  isActive: boolean;
  createdAt: string;
  activeTrip: {
    id: string;
    routeId: string;
    routeName: string;
    startTime: string;
  } | null;
  assignedBus: {
    id: string;
    plateNumber: string;
    model: string | null;
    status: string;
    capacity: number;
  } | null;
}

export default function AdminDriversPage() {
  const [drivers, setDrivers] = useState<DriverItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filterAvailability, setFilterAvailability] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingDriver, setEditingDriver] = useState<DriverItem | null>(null);
  const [name, setName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [licenseNumber, setLicenseNumber] = useState<string>('');
  const [modalError, setModalError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Global Banner / Toast Error
  const [noticeMessage, setNoticeMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const fetchDrivers = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await getAdminDriversAction({
        search: searchTerm.trim() || undefined,
        limit: 100,
      });
      if (res?.data) {
        setDrivers(res.data);
      }
    } catch (err: any) {
      setNoticeMessage({
        type: 'error',
        text: err.message || 'Failed to fetch driver personnel records',
      });
    } finally {
      setIsLoading(false);
    }
  }, [searchTerm]);

  useEffect(() => {
    fetchDrivers();
  }, [fetchDrivers]);

  const handleOpenAddModal = () => {
    setEditingDriver(null);
    setName('');
    setEmail('');
    setPassword('');
    setPhone('');
    setLicenseNumber('');
    setModalError(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (driver: DriverItem) => {
    setEditingDriver(driver);
    setName(driver.name || '');
    setEmail(driver.email);
    setPassword('');
    setPhone(driver.phone || '');
    setLicenseNumber(driver.licenseNumber);
    setModalError(null);
    setIsModalOpen(true);
  };

  const handleSaveDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);

    if (!editingDriver && !email.trim()) {
      setModalError('Driver user email address is required.');
      return;
    }
    if (!licenseNumber.trim()) {
      setModalError('Commercial driver license number is required.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingDriver) {
        const res = await updateAdminDriverAction(editingDriver.id, {
          name: name.trim() || undefined,
          licenseNumber: licenseNumber.trim(),
          phone: phone.trim() || undefined,
        });
        if (!res.success) {
          setModalError(res.error || 'Failed to update driver details');
          setIsSubmitting(false);
          return;
        }
        setNoticeMessage({
          type: 'success',
          text: `Driver '${name || licenseNumber}' updated successfully.`,
        });
      } else {
        const res = await createAdminDriverAction({
          email: email.trim().toLowerCase(),
          name: name.trim() || undefined,
          licenseNumber: licenseNumber.trim(),
          phone: phone.trim() || undefined,
          password: password.trim() || undefined,
        });
        if (!res.success) {
          setModalError(res.error || 'Failed to create driver account');
          setIsSubmitting(false);
          return;
        }
        setNoticeMessage({
          type: 'success',
          text: `Driver account for '${email.trim()}' created successfully.`,
        });
      }

      setIsModalOpen(false);
      fetchDrivers();
    } catch (err: any) {
      setModalError(err.message || 'Error processing driver record');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (driver: DriverItem) => {
    const newStatus = !driver.isActive;

    // Optimistic toggle
    setDrivers((prev) =>
      prev.map((d) => (d.id === driver.id ? { ...d, isActive: newStatus } : d)),
    );

    const res = await toggleAdminDriverActiveAction(driver.id, newStatus);
    if (!res.success) {
      // Revert optimistic update & display backend's 400 error cleanly
      setDrivers((prev) =>
        prev.map((d) => (d.id === driver.id ? { ...d, isActive: driver.isActive } : d)),
      );
      setNoticeMessage({
        type: 'error',
        text: res.error || 'Failed to toggle driver active status.',
      });
      return;
    }

    setNoticeMessage({
      type: 'success',
      text: `Driver '${driver.name || driver.licenseNumber}' set to ${
        newStatus ? 'ACTIVE' : 'INACTIVE'
      }.`,
    });
    fetchDrivers();
  };

  const filteredDrivers = drivers.filter((driver) => {
    if (filterAvailability === 'ACTIVE') return driver.isActive;
    if (filterAvailability === 'INACTIVE') return !driver.isActive;
    return true;
  });

  return (
    <div className="flex flex-col space-y-6 animate-slide-up">
      {/* 1. Header & Actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-gray-200 pb-5">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">
            Driver Personnel Roster
          </h1>
          <p className="mt-1 text-xs text-gray-500">
            Certified driver credentials, contact records, active assignment states, and dispatch availability
          </p>
        </div>

        <Button
          variant="primary"
          size="md"
          onClick={handleOpenAddModal}
          className="rounded-xl bg-amber-500 hover:bg-amber-600 font-bold text-gray-950 shadow-md text-xs"
        >
          ➕ Register New Driver
        </Button>
      </div>

      {/* 2. Notice / Toast Alert */}
      {noticeMessage && (
        <div
          className={`flex items-center justify-between rounded-2xl border p-4 text-xs font-bold shadow-sm animate-fadeIn ${
            noticeMessage.type === 'error'
              ? 'border-rose-300 bg-rose-50 text-rose-800'
              : 'border-emerald-300 bg-emerald-50 text-emerald-800'
          }`}
          role="alert"
        >
          <span>
            {noticeMessage.type === 'error' ? '⚠️ ' : '✅ '}
            {noticeMessage.text}
          </span>
          <button
            onClick={() => setNoticeMessage(null)}
            className="text-gray-400 hover:text-gray-700"
          >
            ✕
          </button>
        </div>
      )}

      {/* 3. Filters & Search */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full max-w-sm">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by driver name, email, phone, or license..."
            className="w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2 text-xs text-gray-900 placeholder-gray-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 shadow-sm"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-2 text-xs text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          )}
        </div>

        {/* Availability Filter Pills */}
        <div className="flex flex-wrap gap-1.5 rounded-xl border border-gray-200 bg-gray-100/70 p-1">
          {(['ALL', 'ACTIVE', 'INACTIVE'] as const).map((status) => (
            <button
              key={status}
              onClick={() => setFilterAvailability(status)}
              className={`rounded-lg px-3 py-1 text-xs font-bold transition-all ${
                filterAvailability === status
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {/* 4. Drivers Table */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-2xl" />
          ))}
        </div>
      ) : filteredDrivers.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-12 text-center shadow-sm">
          <EmptyState
            title="No drivers found"
            description="No driver personnel match your search criteria. Try a different search or onboard a new driver."
          />
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-600">
              <thead className="border-b border-gray-100 bg-gray-50 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                <tr>
                  <th scope="col" className="px-5 py-3.5">Driver Personnel</th>
                  <th scope="col" className="px-5 py-3.5">Contact Phone</th>
                  <th scope="col" className="px-5 py-3.5">License Number</th>
                  <th scope="col" className="px-5 py-3.5">Active Transit / Vehicle</th>
                  <th scope="col" className="px-5 py-3.5 text-center">Dispatch Availability</th>
                  <th scope="col" className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredDrivers.map((driver) => {
                  return (
                    <tr key={driver.id} className="transition-colors hover:bg-gray-50/70">
                      {/* Driver Name & Email */}
                      <td className="px-5 py-4">
                        <div className="font-black text-gray-900">
                          {driver.name || 'Unnamed Driver'}
                        </div>
                        <div className="text-[11px] text-gray-500">
                          {driver.email}
                        </div>
                      </td>

                      {/* Phone */}
                      <td className="px-5 py-4">
                        {driver.phone ? (
                          <span className="font-mono text-xs font-semibold text-gray-800">
                            {driver.phone}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400 italic">Not provided</span>
                        )}
                      </td>

                      {/* License */}
                      <td className="px-5 py-4">
                        <span className="inline-block rounded-md bg-gray-100 px-2 py-0.5 font-mono text-xs font-bold text-gray-800">
                          {driver.licenseNumber}
                        </span>
                      </td>

                      {/* Active Transit / Bus */}
                      <td className="px-5 py-4">
                        {driver.activeTrip ? (
                          <div className="space-y-1">
                            <StatusBadge status="ON ROUTE" color="success" />
                            <div className="font-bold text-emerald-700 text-xs">
                              🚍 {driver.activeTrip.routeName}
                            </div>
                            <div className="text-[11px] text-gray-500">
                              Bus: {driver.assignedBus?.plateNumber || 'Assigned'}
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <StatusBadge status="IDLE / AVAILABLE" color="neutral" />
                          </div>
                        )}
                      </td>

                      {/* Active Toggle Switch */}
                      <td className="px-5 py-4 text-center">
                        <div className="flex flex-col items-center">
                          <button
                            type="button"
                            role="switch"
                            aria-checked={driver.isActive}
                            onClick={() => handleToggleActive(driver)}
                            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                              driver.isActive ? 'bg-emerald-500' : 'bg-gray-300'
                            }`}
                          >
                            <span
                              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                driver.isActive ? 'translate-x-5' : 'translate-x-0'
                              }`}
                            />
                          </button>
                          <span className="mt-1 text-[10px] font-bold text-gray-400">
                            {driver.isActive ? 'Active' : 'Deactivated'}
                          </span>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-4 text-right">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleOpenEditModal(driver)}
                          className="rounded-lg text-xs font-bold text-gray-700 border-gray-300 hover:bg-gray-100"
                        >
                          Edit
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 5. Add / Edit Driver Modal */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fadeIn"
          role="dialog"
          aria-modal="true"
        >
          <div className="relative w-full max-w-md rounded-3xl border border-gray-100 bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between border-b border-gray-100 pb-3">
              <h3 className="text-lg font-black text-gray-900">
                {editingDriver ? 'Edit Driver Record' : 'Onboard Driver Personnel'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                disabled={isSubmitting}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            {modalError && (
              <div className="mt-4 rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs font-bold text-rose-800">
                ⚠️ {modalError}
              </div>
            )}

            <form onSubmit={handleSaveDriver} className="mt-4 space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-700">Full Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Ramesh Kumar"
                  className="w-full rounded-xl border border-gray-300 p-2.5 text-xs text-gray-900 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  disabled={isSubmitting}
                />
              </div>

              {!editingDriver && (
                <>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-700">
                      Email Address <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="driver@bmsit.in"
                      className="w-full rounded-xl border border-gray-300 p-2.5 text-xs text-gray-900 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                      required
                      disabled={isSubmitting}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-700">
                      Initial Password{' '}
                      <span className="text-[10px] text-gray-400 font-normal">
                        (Leave blank to default: Driver@BTS2026)
                      </span>
                    </label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full rounded-xl border border-gray-300 p-2.5 text-xs text-gray-900 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                      disabled={isSubmitting}
                    />
                  </div>
                </>
              )}

              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-700">Contact Phone Number</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. +91 98765 43210"
                  className="w-full rounded-xl border border-gray-300 p-2.5 text-xs text-gray-900 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  disabled={isSubmitting}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-700">
                  Commercial Driving License <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={licenseNumber}
                  onChange={(e) => setLicenseNumber(e.target.value.toUpperCase())}
                  placeholder="e.g. KA04-2022-0098765"
                  className="w-full rounded-xl border border-gray-300 p-2.5 text-xs font-bold text-gray-900 uppercase focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  required
                  disabled={isSubmitting}
                />
              </div>

              <div className="mt-6 flex items-center justify-end space-x-3 pt-3 border-t border-gray-100">
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isSubmitting}
                  className="rounded-xl border border-gray-300 text-xs font-bold text-gray-700"
                >
                  Cancel
                </Button>

                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  disabled={isSubmitting}
                  className="rounded-xl bg-amber-500 hover:bg-amber-600 font-bold text-gray-950 shadow-md text-xs"
                >
                  {isSubmitting
                    ? 'Saving...'
                    : editingDriver
                    ? 'Update Driver'
                    : 'Create Driver'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
