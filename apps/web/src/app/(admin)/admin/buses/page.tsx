'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  getAdminBusesAction,
  createAdminBusAction,
  updateAdminBusAction,
  toggleAdminBusActiveAction,
} from '@/services/admin.service';
import { StatusBadge, Skeleton, EmptyState, Button } from '@bts/ui';

interface BusItem {
  id: string;
  plateNumber: string;
  capacity: number;
  model: string | null;
  status: 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE';
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  activeTrip: { id: string; routeName: string } | null;
  assignedDriver: { id: string; name: string | null; licenseNumber: string } | null;
  maintenanceCount: number;
}

export default function AdminBusesPage() {
  const [buses, setBuses] = useState<BusItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingBus, setEditingBus] = useState<BusItem | null>(null);
  const [plateNumber, setPlateNumber] = useState<string>('');
  const [model, setModel] = useState<string>('');
  const [capacity, setCapacity] = useState<number>(40);
  const [modalError, setModalError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Global Toast / Banner Error
  const [noticeMessage, setNoticeMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const fetchBuses = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await getAdminBusesAction({
        search: searchTerm.trim() || undefined,
        status: statusFilter !== 'ALL' ? statusFilter : undefined,
        limit: 100,
      });
      if (res?.data) {
        setBuses(res.data);
      }
    } catch (err: any) {
      setNoticeMessage({
        type: 'error',
        text: err.message || 'Failed to fetch bus fleet records',
      });
    } finally {
      setIsLoading(false);
    }
  }, [searchTerm, statusFilter]);

  useEffect(() => {
    fetchBuses();
  }, [fetchBuses]);

  const handleOpenAddModal = () => {
    setEditingBus(null);
    setPlateNumber('');
    setModel('');
    setCapacity(40);
    setModalError(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (bus: BusItem) => {
    setEditingBus(bus);
    setPlateNumber(bus.plateNumber);
    setModel(bus.model || '');
    setCapacity(bus.capacity);
    setModalError(null);
    setIsModalOpen(true);
  };

  const handleSaveBus = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);

    if (!plateNumber.trim()) {
      setModalError('Registration plate number is required.');
      return;
    }
    if (capacity <= 0) {
      setModalError('Seating capacity must be strictly greater than 0.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingBus) {
        const res = await updateAdminBusAction(editingBus.id, {
          plateNumber: plateNumber.trim(),
          model: model.trim() || undefined,
          capacity: Number(capacity),
        });
        if (!res.success) {
          setModalError(res.error || 'Failed to update bus');
          setIsSubmitting(false);
          return;
        }
        setNoticeMessage({ type: 'success', text: `Bus '${plateNumber}' updated successfully.` });
      } else {
        const res = await createAdminBusAction({
          plateNumber: plateNumber.trim(),
          model: model.trim() || undefined,
          capacity: Number(capacity),
        });
        if (!res.success) {
          setModalError(res.error || 'Failed to register bus');
          setIsSubmitting(false);
          return;
        }
        setNoticeMessage({ type: 'success', text: `Bus '${plateNumber}' registered successfully.` });
      }

      setIsModalOpen(false);
      fetchBuses();
    } catch (err: any) {
      setModalError(err.message || 'Error saving bus details');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (bus: BusItem) => {
    const newStatus = !bus.isActive;

    // Optimistic toggle
    setBuses((prev) =>
      prev.map((b) => (b.id === bus.id ? { ...b, isActive: newStatus } : b)),
    );

    const res = await toggleAdminBusActiveAction(bus.id, newStatus);
    if (!res.success) {
      // Revert optimistic update & display backend's 400 error cleanly
      setBuses((prev) =>
        prev.map((b) => (b.id === bus.id ? { ...b, isActive: bus.isActive } : b)),
      );
      setNoticeMessage({
        type: 'error',
        text: res.error || 'Failed to toggle vehicle status.',
      });
      return;
    }

    setNoticeMessage({
      type: 'success',
      text: `Vehicle '${bus.plateNumber}' marked as ${newStatus ? 'ACTIVE' : 'INACTIVE'}.`,
    });
    fetchBuses();
  };

  return (
    <div className="flex flex-col space-y-6 animate-slide-up">
      {/* 1. Header & Actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-gray-200 pb-5">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">
            Fleet Bus Inventory
          </h1>
          <p className="mt-1 text-xs text-gray-500">
            Vehicle registration, seating capacity, maintenance flags, and operational active toggles
          </p>
        </div>

        <Button
          variant="primary"
          size="md"
          onClick={handleOpenAddModal}
          className="rounded-xl bg-amber-500 hover:bg-amber-600 font-bold text-gray-950 shadow-md text-xs"
        >
          ➕ Register New Bus
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
            placeholder="Search by plate number or model..."
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

        {/* Status Filter Pills */}
        <div className="flex flex-wrap gap-1.5 rounded-xl border border-gray-200 bg-gray-100/70 p-1">
          {['ALL', 'ACTIVE', 'INACTIVE', 'MAINTENANCE'].map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`rounded-lg px-3 py-1 text-xs font-bold transition-all ${
                statusFilter === status
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {/* 4. Buses Table */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-2xl" />
          ))}
        </div>
      ) : buses.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-12 text-center shadow-sm">
          <EmptyState
            title="No vehicles found"
            description="No bus records match your search criteria. Try a different filter or register a new bus."
          />
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-600">
              <thead className="border-b border-gray-100 bg-gray-50 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                <tr>
                  <th scope="col" className="px-5 py-3.5">Registration Plate</th>
                  <th scope="col" className="px-5 py-3.5">Model / Make</th>
                  <th scope="col" className="px-5 py-3.5">Capacity</th>
                  <th scope="col" className="px-5 py-3.5">Status</th>
                  <th scope="col" className="px-5 py-3.5">Assigned Trip / Driver</th>
                  <th scope="col" className="px-5 py-3.5 text-center">Active Availability</th>
                  <th scope="col" className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {buses.map((bus) => {
                  let statusColor: 'success' | 'warning' | 'danger' | 'info' | 'neutral' = 'neutral';
                  if (bus.status === 'ACTIVE') statusColor = 'success';
                  else if (bus.status === 'MAINTENANCE') statusColor = 'danger';
                  else if (bus.status === 'INACTIVE') statusColor = 'neutral';

                  return (
                    <tr key={bus.id} className="transition-colors hover:bg-gray-50/70">
                      {/* Plate */}
                      <td className="px-5 py-4">
                        <div className="font-black text-gray-900 tracking-wide">
                          {bus.plateNumber}
                        </div>
                        <div className="text-[11px] text-gray-400 font-mono">
                          ID: {bus.id.slice(-8)}
                        </div>
                      </td>

                      {/* Model */}
                      <td className="px-5 py-4 font-semibold text-gray-800">
                        {bus.model || 'Standard Transit'}
                      </td>

                      {/* Capacity */}
                      <td className="px-5 py-4">
                        <span className="font-extrabold text-gray-900">{bus.capacity}</span>{' '}
                        <span className="text-xs text-gray-400">seats</span>
                      </td>

                      {/* Status */}
                      <td className="px-5 py-4">
                        <StatusBadge status={bus.status} color={statusColor} />
                      </td>

                      {/* Assigned Trip & Driver */}
                      <td className="px-5 py-4">
                        {bus.activeTrip ? (
                          <div>
                            <div className="font-bold text-emerald-700 text-xs">
                              🚍 {bus.activeTrip.routeName}
                            </div>
                            <div className="text-[11px] text-gray-500">
                              Driver: {bus.assignedDriver?.name || bus.assignedDriver?.licenseNumber || 'Assigned'}
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400 italic">No active transit</span>
                        )}
                      </td>

                      {/* Active Toggle Switch */}
                      <td className="px-5 py-4 text-center">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={bus.isActive}
                          onClick={() => handleToggleActive(bus)}
                          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                            bus.isActive ? 'bg-emerald-500' : 'bg-gray-300'
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                              bus.isActive ? 'translate-x-5' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-4 text-right">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleOpenEditModal(bus)}
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

      {/* 5. Add / Edit Bus Modal */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fadeIn"
          role="dialog"
          aria-modal="true"
        >
          <div className="relative w-full max-w-md rounded-3xl border border-gray-100 bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between border-b border-gray-100 pb-3">
              <h3 className="text-lg font-black text-gray-900">
                {editingBus ? 'Edit Vehicle Details' : 'Register Campus Bus'}
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

            <form onSubmit={handleSaveBus} className="mt-4 space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-700">
                  Registration Plate Number <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={plateNumber}
                  onChange={(e) => setPlateNumber(e.target.value.toUpperCase())}
                  placeholder="e.g. KA-01-F-1234"
                  className="w-full rounded-xl border border-gray-300 p-2.5 text-xs font-bold text-gray-900 uppercase focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  required
                  disabled={isSubmitting}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-700">Vehicle Model / Make</label>
                <input
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="e.g. Tata Marcopolo BS6"
                  className="w-full rounded-xl border border-gray-300 p-2.5 text-xs text-gray-900 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  disabled={isSubmitting}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-700">
                  Seating Capacity (&gt; 0) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  max="120"
                  value={capacity}
                  onChange={(e) => setCapacity(parseInt(e.target.value, 10) || 0)}
                  className="w-full rounded-xl border border-gray-300 p-2.5 text-xs font-bold text-gray-900 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
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
                  {isSubmitting ? 'Saving...' : editingBus ? 'Update Bus' : 'Register Bus'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
