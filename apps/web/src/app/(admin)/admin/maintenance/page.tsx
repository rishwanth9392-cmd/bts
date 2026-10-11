'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  getAdminMaintenanceAction,
  createAdminMaintenanceAction,
  updateAdminMaintenanceAction,
  getAdminBusesAction,
} from '@/services/admin.service';
import { StatusBadge, Skeleton, EmptyState, Button } from '@bts/ui';

interface MaintenanceTicket {
  id: string;
  busId: string;
  category: 'ENGINE' | 'TIRES' | 'ELECTRICAL' | 'GENERAL';
  description: string;
  status: 'REPORTED' | 'IN_PROGRESS' | 'RESOLVED';
  reportedAt: string;
  resolvedAt: string | null;
  notes: string | null;
  bus: {
    id: string;
    plateNumber: string;
    model: string | null;
    status: string;
    isActive: boolean;
  };
}

interface BusOption {
  id: string;
  plateNumber: string;
  model: string | null;
}

export default function AdminMaintenancePage() {
  const [tickets, setTickets] = useState<MaintenanceTicket[]>([]);
  const [buses, setBuses] = useState<BusOption[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');

  // Report Issue Dialog State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [createBusId, setCreateBusId] = useState<string>('');
  const [createCategory, setCreateCategory] = useState<string>('ENGINE');
  const [createDescription, setCreateDescription] = useState<string>('');
  const [createNotes, setCreateNotes] = useState<string>('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [isSubmittingCreate, setIsSubmittingCreate] = useState<boolean>(false);

  // Update Status Dialog State
  const [updatingTicket, setUpdatingTicket] = useState<MaintenanceTicket | null>(null);
  const [updateStatus, setUpdateStatus] = useState<'REPORTED' | 'IN_PROGRESS' | 'RESOLVED'>('IN_PROGRESS');
  const [updateNotes, setUpdateNotes] = useState<string>('');
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [isSubmittingUpdate, setIsSubmittingUpdate] = useState<boolean>(false);

  // Notice toast
  const [noticeMessage, setNoticeMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const fetchTickets = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await getAdminMaintenanceAction({
        status: statusFilter !== 'ALL' ? statusFilter : undefined,
        category: categoryFilter !== 'ALL' ? categoryFilter : undefined,
        limit: 100,
      });
      if (res?.data) {
        setTickets(res.data);
      }
    } catch (err: any) {
      setNoticeMessage({
        type: 'error',
        text: err.message || 'Failed to fetch maintenance tickets',
      });
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, categoryFilter]);

  const loadBuses = async () => {
    try {
      const res = await getAdminBusesAction({ limit: 100 });
      if (res?.data) {
        setBuses(res.data);
        if (res.data.length > 0 && !createBusId) {
          setCreateBusId(res.data[0].id);
        }
      }
    } catch (err: any) {
      console.error('Failed to load buses for maintenance selector:', err);
    }
  };

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  useEffect(() => {
    loadBuses();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isCreateModalOpen && !isSubmittingCreate) {
          setIsCreateModalOpen(false);
        }
        if (updatingTicket && !isSubmittingUpdate) {
          setUpdatingTicket(null);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCreateModalOpen, isSubmittingCreate, updatingTicket, isSubmittingUpdate]);

  const handleOpenCreateModal = () => {
    setCreateDescription('');
    setCreateNotes('');
    setCreateCategory('ENGINE');
    if (buses.length > 0) {
      setCreateBusId(buses[0].id);
    }
    setCreateError(null);
    setIsCreateModalOpen(true);
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createBusId) {
      setCreateError('Please select a vehicle.');
      return;
    }
    if (!createDescription.trim()) {
      setCreateError('Please describe the maintenance issue.');
      return;
    }

    setIsSubmittingCreate(true);
    setCreateError(null);

    try {
      const res = await createAdminMaintenanceAction({
        busId: createBusId,
        category: createCategory,
        description: createDescription.trim(),
        notes: createNotes.trim() || undefined,
      });

      if (!res.success) {
        setCreateError(res.error || 'Failed to submit maintenance ticket');
        setIsSubmittingCreate(false);
        return;
      }

      setNoticeMessage({
        type: 'success',
        text: 'Maintenance work ticket logged and audited successfully.',
      });
      setIsCreateModalOpen(false);
      fetchTickets();
    } catch (err: any) {
      setCreateError(err.message || 'Error submitting ticket');
    } finally {
      setIsSubmittingCreate(false);
    }
  };

  const handleOpenUpdateModal = (ticket: MaintenanceTicket) => {
    setUpdatingTicket(ticket);
    setUpdateStatus(
      ticket.status === 'REPORTED'
        ? 'IN_PROGRESS'
        : ticket.status === 'IN_PROGRESS'
        ? 'RESOLVED'
        : 'RESOLVED',
    );
    setUpdateNotes(ticket.notes || '');
    setUpdateError(null);
  };

  const handleUpdateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!updatingTicket) return;

    setIsSubmittingUpdate(true);
    setUpdateError(null);

    try {
      const res = await updateAdminMaintenanceAction(updatingTicket.id, {
        status: updateStatus,
        notes: updateNotes.trim() || undefined,
      });

      if (!res.success) {
        setUpdateError(res.error || 'Failed to update ticket status');
        setIsSubmittingUpdate(false);
        return;
      }

      setNoticeMessage({
        type: 'success',
        text: `Ticket for vehicle '${updatingTicket.bus.plateNumber}' updated to ${updateStatus}.`,
      });
      setUpdatingTicket(null);
      fetchTickets();
    } catch (err: any) {
      setUpdateError(err.message || 'Error updating ticket');
    } finally {
      setIsSubmittingUpdate(false);
    }
  };

  return (
    <div className="flex flex-col space-y-6 animate-slide-up">
      {/* 1. Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-gray-200 pb-5">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">
            Fleet Maintenance & Service Desk
          </h1>
          <p className="mt-1 text-xs text-gray-500">
            Work order lifecycle tracking, workshop diagnostics, and vehicle roadworthiness inspection
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => fetchTickets()}
            disabled={isLoading}
            className="rounded-xl border border-gray-300 text-xs font-bold text-gray-700 hover:bg-gray-50"
          >
            {isLoading ? 'Updating...' : '🔄 Refresh'}
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={handleOpenCreateModal}
            className="rounded-xl bg-amber-500 hover:bg-amber-600 font-bold text-gray-950 shadow-md text-xs"
          >
            🔧 Report Vehicle Issue
          </Button>
        </div>
      </div>

      {/* 2. Notice Toast */}
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

      {/* 3. Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Status Pills */}
        <div className="flex flex-wrap gap-1.5 rounded-xl border border-gray-200 bg-gray-100/70 p-1">
          {['ALL', 'REPORTED', 'IN_PROGRESS', 'RESOLVED'].map((status) => (
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

        {/* Category Selector */}
        <div className="flex items-center gap-2">
          <label className="text-xs font-bold text-gray-500">Category:</label>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-xl border border-gray-300 bg-white px-3 py-1.5 text-xs font-bold text-gray-800 shadow-sm focus:border-amber-500 focus:outline-none"
          >
            <option value="ALL">All Categories</option>
            <option value="ENGINE">Engine & Transmission</option>
            <option value="TIRES">Tires & Brakes</option>
            <option value="ELECTRICAL">Electrical & Telematics</option>
            <option value="GENERAL">General Maintenance</option>
          </select>
        </div>
      </div>

      {/* 4. Tickets Table */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-2xl" />
          ))}
        </div>
      ) : tickets.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-12 text-center shadow-sm">
          <EmptyState
            title="No maintenance records found"
            description="All fleet buses are healthy or no service tickets match your selected filters."
          />
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-600">
              <thead className="border-b border-gray-100 bg-gray-50 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                <tr>
                  <th scope="col" className="px-5 py-3.5">Vehicle</th>
                  <th scope="col" className="px-5 py-3.5">Category</th>
                  <th scope="col" className="px-5 py-3.5">Description & Workshop Notes</th>
                  <th scope="col" className="px-5 py-3.5">Status</th>
                  <th scope="col" className="px-5 py-3.5">Reported</th>
                  <th scope="col" className="px-5 py-3.5">Resolved</th>
                  <th scope="col" className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {tickets.map((ticket) => {
                  let statusColor: 'danger' | 'warning' | 'success' = 'danger';
                  if (ticket.status === 'IN_PROGRESS') statusColor = 'warning';
                  else if (ticket.status === 'RESOLVED') statusColor = 'success';

                  return (
                    <tr key={ticket.id} className="transition-colors hover:bg-gray-50/70">
                      {/* Bus */}
                      <td className="px-5 py-4">
                        <div className="font-black text-gray-900">
                          {ticket.bus?.plateNumber || 'Bus N/A'}
                        </div>
                        <div className="text-[11px] text-gray-400">
                          {ticket.bus?.model || 'Standard Bus'}
                        </div>
                      </td>

                      {/* Category */}
                      <td className="px-5 py-4 font-bold text-gray-800 text-xs">
                        <span className="inline-block rounded-md bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
                          {ticket.category}
                        </span>
                      </td>

                      {/* Description & Notes */}
                      <td className="px-5 py-4 max-w-sm">
                        <div className="font-semibold text-gray-900 text-xs">
                          {ticket.description}
                        </div>
                        {ticket.notes && (
                          <div className="mt-1 text-[11px] text-gray-500 italic">
                            Notes: {ticket.notes}
                          </div>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-5 py-4">
                        <StatusBadge status={ticket.status} color={statusColor} />
                      </td>

                      {/* Reported */}
                      <td className="px-5 py-4 text-xs text-gray-700">
                        {new Date(ticket.reportedAt).toLocaleDateString()}
                      </td>

                      {/* Resolved */}
                      <td className="px-5 py-4 text-xs text-gray-700">
                        {ticket.resolvedAt ? (
                          <span className="text-emerald-700 font-bold">
                            {new Date(ticket.resolvedAt).toLocaleDateString()}
                          </span>
                        ) : (
                          <span className="text-gray-400 italic">Open</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-4 text-right">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleOpenUpdateModal(ticket)}
                          className="rounded-lg text-xs font-bold text-gray-700 border-gray-300 hover:bg-gray-100"
                        >
                          Update Status
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

      {/* 5. Report Issue Dialog */}
      {isCreateModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fadeIn"
          role="dialog"
          aria-modal="true"
        >
          <div className="relative w-full max-w-md rounded-3xl border border-gray-100 bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between border-b border-gray-100 pb-3">
              <h3 className="text-lg font-black text-gray-900">
                Log Vehicle Maintenance Work Order
              </h3>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                disabled={isSubmittingCreate}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            {createError && (
              <div
                id="maintenance-create-error"
                role="alert"
                className="mt-4 rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs font-bold text-rose-800"
              >
                ⚠️ {createError}
              </div>
            )}

            <form onSubmit={handleCreateTicket} className="mt-4 space-y-4">
              <div className="space-y-1">
                <label htmlFor="create-bus-id" className="text-xs font-bold text-gray-700">
                  Select Campus Vehicle <span className="text-rose-500">*</span>
                </label>
                <select
                  id="create-bus-id"
                  value={createBusId}
                  onChange={(e) => setCreateBusId(e.target.value)}
                  aria-describedby={createError ? 'maintenance-create-error' : undefined}
                  className="w-full rounded-xl border border-gray-300 p-2.5 text-xs font-bold text-gray-900 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  required
                  disabled={isSubmittingCreate}
                >
                  {buses.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.plateNumber} ({b.model || 'Standard Transit'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label htmlFor="create-category" className="text-xs font-bold text-gray-700">Maintenance Category</label>
                <select
                  id="create-category"
                  value={createCategory}
                  onChange={(e) => setCreateCategory(e.target.value as any)}
                  className="w-full rounded-xl border border-gray-300 p-2.5 text-xs font-bold text-gray-900 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  disabled={isSubmittingCreate}
                >
                  <option value="ENGINE">Engine & Transmission</option>
                  <option value="TIRES">Tires & Brake Assembly</option>
                  <option value="ELECTRICAL">Electrical & Telematics Sensors</option>
                  <option value="GENERAL">General Inspection & Bodywork</option>
                </select>
              </div>

              <div className="space-y-1">
                <label htmlFor="create-description" className="text-xs font-bold text-gray-700">
                  Issue Description <span className="text-rose-500">*</span>
                </label>
                <input
                  id="create-description"
                  type="text"
                  value={createDescription}
                  onChange={(e) => setCreateDescription(e.target.value)}
                  placeholder="e.g. Brake pad wear detected during route inspection"
                  aria-describedby={createError ? 'maintenance-create-error' : undefined}
                  className="w-full rounded-xl border border-gray-300 p-2.5 text-xs text-gray-900 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  required
                  disabled={isSubmittingCreate}
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="create-notes" className="text-xs font-bold text-gray-700">Additional Workshop Notes</label>
                <textarea
                  id="create-notes"
                  rows={3}
                  value={createNotes}
                  onChange={(e) => setCreateNotes(e.target.value)}
                  placeholder="Any immediate instructions or diagnostic codes..."
                  className="w-full rounded-xl border border-gray-300 p-2.5 text-xs text-gray-900 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  disabled={isSubmittingCreate}
                />
              </div>

              <div className="mt-6 flex items-center justify-end space-x-3 pt-3 border-t border-gray-100">
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  onClick={() => setIsCreateModalOpen(false)}
                  disabled={isSubmittingCreate}
                  className="rounded-xl border border-gray-300 text-xs font-bold text-gray-700"
                >
                  Cancel
                </Button>

                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  disabled={isSubmittingCreate}
                  className="rounded-xl bg-amber-500 hover:bg-amber-600 font-bold text-gray-950 shadow-md text-xs"
                >
                  {isSubmittingCreate ? 'Submitting...' : 'Log Ticket'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. Update Status Dialog */}
      {updatingTicket && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fadeIn"
          role="dialog"
          aria-modal="true"
        >
          <div className="relative w-full max-w-md rounded-3xl border border-gray-100 bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between border-b border-gray-100 pb-3">
              <div>
                <h3 className="text-lg font-black text-gray-900">
                  Update Service Status
                </h3>
                <p className="text-xs text-gray-500">
                  Bus: <span className="font-bold text-gray-900">{updatingTicket.bus?.plateNumber}</span>
                </p>
              </div>
              <button
                onClick={() => setUpdatingTicket(null)}
                disabled={isSubmittingUpdate}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            {updateError && (
              <div
                id="maintenance-update-error"
                role="alert"
                className="mt-4 rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs font-bold text-rose-800"
              >
                ⚠️ {updateError}
              </div>
            )}

            <form onSubmit={handleUpdateTicket} className="mt-4 space-y-4">
              <div className="space-y-1">
                <label htmlFor="update-status" className="text-xs font-bold text-gray-700">Transition Status</label>
                <select
                  id="update-status"
                  value={updateStatus}
                  onChange={(e) => setUpdateStatus(e.target.value as any)}
                  aria-describedby={updateError ? 'maintenance-update-error' : undefined}
                  className="w-full rounded-xl border border-gray-300 p-2.5 text-xs font-bold text-gray-900 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  disabled={isSubmittingUpdate}
                >
                  <option value="REPORTED">REPORTED (Awaiting Inspection)</option>
                  <option value="IN_PROGRESS">IN_PROGRESS (Under Active Repair)</option>
                  <option value="RESOLVED">RESOLVED (Repairs Complete & Certified)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label htmlFor="update-notes" className="text-xs font-bold text-gray-700">Operational Notes</label>
                <textarea
                  id="update-notes"
                  rows={3}
                  value={updateNotes}
                  onChange={(e) => setUpdateNotes(e.target.value)}
                  placeholder="Record workshop repair steps or parts replaced..."
                  className="w-full rounded-xl border border-gray-300 p-2.5 text-xs text-gray-900 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  disabled={isSubmittingUpdate}
                />
              </div>

              <div className="mt-6 flex items-center justify-end space-x-3 pt-3 border-t border-gray-100">
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  onClick={() => setUpdatingTicket(null)}
                  disabled={isSubmittingUpdate}
                  className="rounded-xl border border-gray-300 text-xs font-bold text-gray-700"
                >
                  Cancel
                </Button>

                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  disabled={isSubmittingUpdate}
                  className="rounded-xl bg-amber-500 hover:bg-amber-600 font-bold text-gray-950 shadow-md text-xs"
                >
                  {isSubmittingUpdate ? 'Updating...' : 'Save Changes'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
