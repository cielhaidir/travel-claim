"use client";

import { useState } from "react";
import { api } from "@/trpc/react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useSession } from "next-auth/react";

// ─── Types ────────────────────────────────────────────────────────────────────

type BailoutStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "APPROVED_CHIEF"
  | "APPROVED_DIRECTOR"
  | "REJECTED"
  | "DISBURSED";

type BailoutCategory = "TRANSPORT" | "HOTEL" | "MEAL" | "OTHER";

interface Bailout {
  id: string;
  bailoutNumber: string;
  description: string;
  amount: number | string;
  status: BailoutStatus;
  category: BailoutCategory;
  // Transport
  transportMode?: string | null;
  carrier?: string | null;
  departureFrom?: string | null;
  arrivalTo?: string | null;
  departureAt?: string | Date | null;
  arrivalAt?: string | Date | null;
  flightNumber?: string | null;
  seatClass?: string | null;
  bookingRef?: string | null;
  // Hotel
  hotelName?: string | null;
  hotelAddress?: string | null;
  checkIn?: string | Date | null;
  checkOut?: string | Date | null;
  roomType?: string | null;
  // Meal
  mealDate?: string | Date | null;
  mealLocation?: string | null;
  // Timestamps & relations
  createdAt: string | Date;
  submittedAt: string | Date | null;
  chiefApprovedAt: string | Date | null;
  directorApprovedAt: string | Date | null;
  disbursedAt: string | Date | null;
  rejectedAt: string | Date | null;
  requester: { id: string; name: string | null };
  chiefApprover?: { id: string; name: string | null } | null;
  directorApprover?: { id: string; name: string | null } | null;
  rejectionReason: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<BailoutCategory, string> = {
  TRANSPORT: "✈️ Transportasi",
  HOTEL: "🏨 Penginapan",
  MEAL: "🍽️ Uang Makan",
  OTHER: "📦 Lainnya",
};

const CATEGORY_COLORS: Record<BailoutCategory, string> = {
  TRANSPORT: "bg-blue-100 text-blue-700",
  HOTEL: "bg-purple-100 text-purple-700",
  MEAL: "bg-green-100 text-green-700",
  OTHER: "bg-gray-100 text-gray-600",
};

const TRANSPORT_MODES = [
  { value: "FLIGHT", label: "✈️ Pesawat" },
  { value: "TRAIN", label: "🚂 Kereta" },
  { value: "BUS", label: "🚌 Bus" },
  { value: "CAR_RENTAL", label: "🚗 Rental Mobil" },
  { value: "FERRY", label: "🚢 Kapal" },
  { value: "OTHER", label: "🔄 Lainnya" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(amount: number | string) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(Number(amount));
}

function formatDate(d: string | Date | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const STATUS_LABELS: Record<BailoutStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Diajukan",
  APPROVED_CHIEF: "Disetujui Chief",
  APPROVED_DIRECTOR: "Disetujui Direktur",
  REJECTED: "Ditolak",
  DISBURSED: "Dicairkan",
};

const STATUS_COLORS: Record<BailoutStatus, string> = {
  DRAFT: "bg-gray-100 text-gray-600",
  SUBMITTED: "bg-yellow-100 text-yellow-700",
  APPROVED_CHIEF: "bg-blue-100 text-blue-700",
  APPROVED_DIRECTOR: "bg-indigo-100 text-indigo-700",
  REJECTED: "bg-red-100 text-red-700",
  DISBURSED: "bg-green-100 text-green-700",
};

// ─── Category Details Display ─────────────────────────────────────────────────

function BailoutCategoryDetails({ b }: { b: Bailout }) {
  if (b.category === "TRANSPORT") {
    return (
      <div className="rounded bg-blue-50 border border-blue-100 p-2 text-xs space-y-1">
        {(b.departureFrom ?? b.arrivalTo) && (
          <p className="font-medium text-blue-800">
            {b.departureFrom ?? "?"} → {b.arrivalTo ?? "?"}
          </p>
        )}
        <div className="flex gap-3 text-gray-600">
          {b.transportMode && <span>{TRANSPORT_MODES.find((m) => m.value === b.transportMode)?.label ?? b.transportMode}</span>}
          {b.carrier && <span>{b.carrier}</span>}
          {b.flightNumber && <span>#{b.flightNumber}</span>}
        </div>
        {b.departureAt && (
          <p className="text-gray-500">
            {formatDate(b.departureAt)}{b.arrivalAt ? ` — ${formatDate(b.arrivalAt)}` : ""}
          </p>
        )}
        {b.bookingRef && <p className="text-gray-500">Booking: {b.bookingRef}</p>}
      </div>
    );
  }

  if (b.category === "HOTEL") {
    return (
      <div className="rounded bg-purple-50 border border-purple-100 p-2 text-xs space-y-1">
        {b.hotelName && <p className="font-medium text-purple-800">{b.hotelName}</p>}
        {b.hotelAddress && <p className="text-gray-600">{b.hotelAddress}</p>}
        {b.checkIn && (
          <p className="text-gray-500">
            Check-in: {formatDate(b.checkIn)}{b.checkOut ? ` — Check-out: ${formatDate(b.checkOut)}` : ""}
          </p>
        )}
        {b.roomType && <p className="text-gray-500">Kamar: {b.roomType}</p>}
      </div>
    );
  }

  if (b.category === "MEAL") {
    return (
      <div className="rounded bg-green-50 border border-green-100 p-2 text-xs space-y-1">
        {b.mealDate && <p className="text-gray-600">Tanggal: {formatDate(b.mealDate)}</p>}
        {b.mealLocation && <p className="text-gray-600">Lokasi: {b.mealLocation}</p>}
      </div>
    );
  }

  return null;
}

// ─── Progress Timeline ────────────────────────────────────────────────────────

function BailoutTimeline({ b }: { b: Bailout }) {
  if (b.status === "REJECTED") {
    return (
      <div className="rounded bg-red-50 border border-red-200 px-3 py-2">
        <p className="text-xs font-semibold text-red-700">❌ Ditolak {formatDate(b.rejectedAt)}</p>
        {b.rejectionReason && <p className="text-xs text-gray-600 mt-1">{b.rejectionReason}</p>}
      </div>
    );
  }

  const steps = [
    { label: "Dibuat", done: true, date: b.createdAt },
    { label: "Diajukan", done: !!b.submittedAt, date: b.submittedAt },
    { label: "Chief", done: !!b.chiefApprovedAt, date: b.chiefApprovedAt, who: b.chiefApprover?.name },
    { label: "Direktur", done: !!b.directorApprovedAt, date: b.directorApprovedAt, who: b.directorApprover?.name },
    { label: "Dicairkan", done: !!b.disbursedAt, date: b.disbursedAt },
  ];

  return (
    <div className="flex items-start">
      {steps.map((s, i) => (
        <div key={i} className="flex flex-1 flex-col items-center">
          <div className="flex w-full items-center">
            <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${s.done ? "bg-blue-500 text-white" : "bg-gray-200 text-gray-400"}`}>
              {s.done ? "✓" : i + 1}
            </div>
            {i < steps.length - 1 && (
              <div className={`h-0.5 flex-1 ${s.done && steps[i + 1]?.done ? "bg-blue-400" : "bg-gray-200"}`} />
            )}
          </div>
          <div className="mt-1 text-center">
            <p className={`text-[10px] font-medium ${s.done ? "text-blue-700" : "text-gray-400"}`}>{s.label}</p>
            {s.done && s.date && <p className="text-[9px] text-gray-400">{formatDate(s.date)}</p>}
            {s.who && <p className="text-[9px] text-gray-500">{s.who}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Action Buttons for Approvers ────────────────────────────────────────────

function BailoutActions({
  bailout,
  userRole,
  onRefresh,
}: {
  bailout: Bailout;
  userRole: string;
  onRefresh: () => void;
}) {
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const chiefRoles = ["SALES_CHIEF", "MANAGER", "DIRECTOR", "ADMIN"];
  const directorRoles = ["DIRECTOR", "ADMIN"];
  const financeRoles = ["FINANCE", "ADMIN"];

  const approveChief = api.bailout.approveByChief.useMutation({ onSuccess: () => { onRefresh(); setShowRejectForm(false); } });
  const approveDirector = api.bailout.approveByDirector.useMutation({ onSuccess: () => { onRefresh(); setShowRejectForm(false); } });
  const reject = api.bailout.reject.useMutation({ onSuccess: () => { onRefresh(); setShowRejectForm(false); } });
  const disburse = api.bailout.disburse.useMutation({ onSuccess: onRefresh });

  const isActing = approveChief.isPending || approveDirector.isPending || reject.isPending || disburse.isPending;

  const canApproveChief = chiefRoles.includes(userRole) && bailout.status === "SUBMITTED";
  const canApproveDirector = directorRoles.includes(userRole) && bailout.status === "APPROVED_CHIEF";
  const canDisburse = financeRoles.includes(userRole) && bailout.status === "APPROVED_DIRECTOR";
  const canReject = chiefRoles.includes(userRole) && ["SUBMITTED", "APPROVED_CHIEF"].includes(bailout.status);

  if (!canApproveChief && !canApproveDirector && !canDisburse) return null;

  return (
    <div className="space-y-2">
      {showRejectForm ? (
        <div className="space-y-2 rounded bg-red-50 border border-red-200 p-2">
          <textarea
            rows={2}
            className="w-full rounded border border-red-300 px-2 py-1 text-xs focus:outline-none"
            placeholder="Alasan penolakan (min. 5 karakter)..."
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowRejectForm(false)} className="text-xs text-gray-500">Batal</button>
            <Button
              variant="destructive"
              isLoading={reject.isPending}
              onClick={() => { if (rejectReason.trim().length >= 5) reject.mutate({ id: bailout.id, rejectionReason: rejectReason }); }}
            >
              Konfirmasi Tolak
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-1">
          {canReject && (
            <button onClick={() => setShowRejectForm(true)} disabled={isActing} className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50 border border-red-200">
              Tolak
            </button>
          )}
          {canApproveChief && (
            <Button isLoading={approveChief.isPending} onClick={() => approveChief.mutate({ id: bailout.id })}>
              ✓ Setujui Chief
            </Button>
          )}
          {canApproveDirector && (
            <Button isLoading={approveDirector.isPending} onClick={() => approveDirector.mutate({ id: bailout.id })}>
              ✓ Setujui Direktur
            </Button>
          )}
          {canDisburse && (
            <Button isLoading={disburse.isPending} onClick={() => disburse.mutate({ id: bailout.id })}>
              💰 Cairkan Dana
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Create Bailout Form ──────────────────────────────────────────────────────

function CreateBailoutForm({
  travelRequestId,
  onSuccess,
}: {
  travelRequestId: string;
  onSuccess: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [category, setCategory] = useState<BailoutCategory>("OTHER");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  // Transport fields
  const [transportMode, setTransportMode] = useState("FLIGHT");
  const [carrier, setCarrier] = useState("");
  const [departureFrom, setDepartureFrom] = useState("");
  const [arrivalTo, setArrivalTo] = useState("");
  const [departureAt, setDepartureAt] = useState("");
  const [arrivalAt, setArrivalAt] = useState("");
  const [flightNumber, setFlightNumber] = useState("");
  const [seatClass, setSeatClass] = useState("");
  const [bookingRef, setBookingRef] = useState("");
  // Hotel fields
  const [hotelName, setHotelName] = useState("");
  const [hotelAddress, setHotelAddress] = useState("");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [roomType, setRoomType] = useState("");
  // Meal fields
  const [mealDate, setMealDate] = useState("");
  const [mealLocation, setMealLocation] = useState("");

  const [error, setError] = useState<string | null>(null);

  const inputCls = "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400";

  const createMutation = api.bailout.create.useMutation({
    onSuccess: async (data) => {
      await submitMutation.mutateAsync({ id: (data as { id: string }).id });
    },
    onError: (err) => setError(err.message),
  });
  const submitMutation = api.bailout.submit.useMutation({
    onSuccess: () => {
      setIsOpen(false);
      setCategory("OTHER"); setDescription(""); setAmount("");
      setTransportMode("FLIGHT"); setCarrier(""); setDepartureFrom(""); setArrivalTo("");
      setDepartureAt(""); setArrivalAt(""); setFlightNumber(""); setSeatClass(""); setBookingRef("");
      setHotelName(""); setHotelAddress(""); setCheckIn(""); setCheckOut(""); setRoomType("");
      setMealDate(""); setMealLocation(""); setError(null);
      onSuccess();
    },
    onError: (err) => setError(err.message),
  });

  const isLoading = createMutation.isPending || submitMutation.isPending;

  const handleSubmit = () => {
    setError(null);
    if (description.trim().length < 5) return setError("Deskripsi minimal 5 karakter");
    const amtNum = parseFloat(amount);
    if (!amtNum || amtNum <= 0) return setError("Masukkan jumlah yang valid");
    createMutation.mutate({
      travelRequestId,
      category,
      description: description.trim(),
      amount: amtNum,
      ...(category === "TRANSPORT" && {
        transportMode: (transportMode || undefined) as "FLIGHT" | "TRAIN" | "BUS" | "FERRY" | "CAR_RENTAL" | "OTHER" | undefined,
        carrier: carrier || undefined,
        departureFrom: departureFrom || undefined,
        arrivalTo: arrivalTo || undefined,
        departureAt: departureAt ? new Date(departureAt) : undefined,
        arrivalAt: arrivalAt ? new Date(arrivalAt) : undefined,
        flightNumber: flightNumber || undefined,
        seatClass: seatClass || undefined,
        bookingRef: bookingRef || undefined,
      }),
      ...(category === "HOTEL" && {
        hotelName: hotelName || undefined,
        hotelAddress: hotelAddress || undefined,
        checkIn: checkIn ? new Date(checkIn) : undefined,
        checkOut: checkOut ? new Date(checkOut) : undefined,
        roomType: roomType || undefined,
      }),
      ...(category === "MEAL" && {
        mealDate: mealDate ? new Date(mealDate) : undefined,
        mealLocation: mealLocation || undefined,
      }),
    });
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-amber-300 py-3 text-sm font-medium text-amber-600 hover:border-amber-400 hover:bg-amber-50 transition-colors"
      >
        + Ajukan Dana Talangan Baru
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-amber-800">Ajukan Dana Talangan Baru</p>
        <button onClick={() => setIsOpen(false)} className="text-xs text-gray-400 hover:text-gray-600">✕</button>
      </div>

      {/* Category */}
      <div>
        <label className="mb-1 block text-xs text-gray-600">Kategori *</label>
        <div className="grid grid-cols-2 gap-2">
          {(Object.entries(CATEGORY_LABELS) as [BailoutCategory, string][]).map(([v, l]) => (
            <button
              key={v}
              type="button"
              onClick={() => setCategory(v)}
              className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                category === v ? "border-amber-400 bg-amber-100 text-amber-800" : "border-gray-200 bg-white text-gray-600 hover:border-amber-200"
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Description */}
      <div>
        <label className="mb-1 block text-xs text-gray-600">Deskripsi *</label>
        <textarea
          rows={2}
          className={inputCls}
          placeholder="cth. Tiket pesawat pulang-pergi (min. 5 karakter)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      {/* Amount */}
      <div>
        <label className="mb-1 block text-xs text-gray-600">Jumlah Dana (Rp) *</label>
        <input
          type="number"
          min={1}
          className={inputCls}
          placeholder="cth. 2500000"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </div>

      {/* Transport-specific */}
      {category === "TRANSPORT" && (
        <div className="space-y-2 rounded-lg border border-blue-200 bg-blue-50 p-3">
          <p className="text-xs font-semibold text-blue-700">Detail Transportasi</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <label className="mb-1 block text-xs text-gray-600">Mode</label>
              <select className={inputCls} value={transportMode} onChange={(e) => setTransportMode(e.target.value)}>
                {TRANSPORT_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-600">Dari</label>
              <input type="text" className={inputCls} placeholder="cth. Ternate" value={departureFrom} onChange={(e) => setDepartureFrom(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-600">Ke</label>
              <input type="text" className={inputCls} placeholder="cth. Jakarta" value={arrivalTo} onChange={(e) => setArrivalTo(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-600">Tgl Berangkat</label>
              <input type="date" className={inputCls} value={departureAt} onChange={(e) => setDepartureAt(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-600">Tgl Tiba</label>
              <input type="date" className={inputCls} value={arrivalAt} min={departureAt} onChange={(e) => setArrivalAt(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-600">Maskapai/Operator</label>
              <input type="text" className={inputCls} placeholder="cth. Garuda" value={carrier} onChange={(e) => setCarrier(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-600">No. Booking</label>
              <input type="text" className={inputCls} placeholder="cth. ABC123" value={bookingRef} onChange={(e) => setBookingRef(e.target.value)} />
            </div>
          </div>
        </div>
      )}

      {/* Hotel-specific */}
      {category === "HOTEL" && (
        <div className="space-y-2 rounded-lg border border-purple-200 bg-purple-50 p-3">
          <p className="text-xs font-semibold text-purple-700">Detail Penginapan</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <label className="mb-1 block text-xs text-gray-600">Nama Hotel *</label>
              <input type="text" className={inputCls} placeholder="cth. Grand Mercure" value={hotelName} onChange={(e) => setHotelName(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-600">Check-in</label>
              <input type="date" className={inputCls} value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-600">Check-out</label>
              <input type="date" className={inputCls} value={checkOut} min={checkIn} onChange={(e) => setCheckOut(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-600">Tipe Kamar</label>
              <input type="text" className={inputCls} placeholder="cth. Superior" value={roomType} onChange={(e) => setRoomType(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-600">Alamat</label>
              <input type="text" className={inputCls} placeholder="Jl. ..." value={hotelAddress} onChange={(e) => setHotelAddress(e.target.value)} />
            </div>
          </div>
        </div>
      )}

      {/* Meal-specific */}
      {category === "MEAL" && (
        <div className="space-y-2 rounded-lg border border-green-200 bg-green-50 p-3">
          <p className="text-xs font-semibold text-green-700">Detail Uang Makan</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs text-gray-600">Tanggal</label>
              <input type="date" className={inputCls} value={mealDate} onChange={(e) => setMealDate(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-600">Lokasi</label>
              <input type="text" className={inputCls} placeholder="cth. Jaksel" value={mealLocation} onChange={(e) => setMealLocation(e.target.value)} />
            </div>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <button onClick={() => setIsOpen(false)} className="text-xs text-gray-500">Batal</button>
        <Button isLoading={isLoading} onClick={handleSubmit}>Ajukan & Submit</Button>
      </div>
    </div>
  );
}

// ─── Main BailoutPanel ────────────────────────────────────────────────────────

interface BailoutPanelProps {
  travelRequestId: string;
  travelRequestNumber: string;
  travelStatus: string;
  isOpen: boolean;
  onClose: () => void;
}

export function BailoutPanel({
  travelRequestId,
  travelRequestNumber,
  travelStatus: _travelStatus,
  isOpen,
  onClose,
}: BailoutPanelProps) {
  const { data: session } = useSession();
  const userRole = session?.user?.role ?? "EMPLOYEE";
  const utils = api.useUtils();

  const bailoutQuery = api.bailout.getAll.useQuery(
    { travelRequestId, limit: 50 },
    { enabled: isOpen }
  );
  const rawData = bailoutQuery.data as { bailouts: Bailout[] } | undefined;
  const isLoading = bailoutQuery.isLoading;

  const bailouts: Bailout[] = rawData?.bailouts ?? [];

  const refresh = () => { void utils.bailout.getAll.invalidate({ travelRequestId }); };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`💰 Dana Talangan — ${travelRequestNumber}`}
      size="lg"
    >
      <div className="space-y-4">
        {/* Summary */}
        {bailouts.length > 0 && (
          <div className="flex gap-3 text-xs">
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-600">{bailouts.length} pengajuan</span>
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-green-700">
              Total: {formatCurrency(bailouts.reduce((s, b) => s + Number(b.amount), 0))}
            </span>
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="flex justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-4 border-blue-400 border-t-transparent" />
          </div>
        )}

        {/* Empty */}
        {!isLoading && bailouts.length === 0 && (
          <div className="rounded-lg border-2 border-dashed border-gray-200 p-6 text-center">
            <p className="text-lg">💰</p>
            <p className="text-sm font-medium text-gray-600">Belum ada dana talangan untuk trip ini</p>
          </div>
        )}

        {/* Bailout Cards */}
        {bailouts.map((b) => (
          <div key={b.id} className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="font-mono text-xs font-semibold text-gray-700">{b.bailoutNumber}</p>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${CATEGORY_COLORS[b.category ?? "OTHER"]}`}>
                    {CATEGORY_LABELS[b.category ?? "OTHER"]}
                  </span>
                </div>
                <p className="text-sm text-gray-800">{b.description}</p>
                <p className="text-sm font-bold text-gray-900 mt-1">{formatCurrency(b.amount)}</p>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_COLORS[b.status]}`}>
                {STATUS_LABELS[b.status]}
              </span>
            </div>

            {/* Category Details */}
            <BailoutCategoryDetails b={b} />

            {/* Timeline */}
            <BailoutTimeline b={b} />

            {/* Approver Actions */}
            <BailoutActions bailout={b} userRole={userRole} onRefresh={refresh} />
          </div>
        ))}

        {/* Create New */}
        <CreateBailoutForm
          travelRequestId={travelRequestId}
          onSuccess={refresh}
        />

        {/* Close */}
        <div className="flex justify-end border-t border-gray-100 pt-3">
          <Button variant="secondary" onClick={onClose}>Tutup</Button>
        </div>
      </div>
    </Modal>
  );
}
