"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { api } from "@/trpc/react";
import { PageHeader } from "@/components/features/PageHeader";
import { EmptyState } from "@/components/features/EmptyState";
import { BailoutFileUpload } from "@/components/features/BailoutFileUpload";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

// ─── Types ────────────────────────────────────────────────────────────────────

type BailoutStatus = "DRAFT" | "SUBMITTED" | "APPROVED_CHIEF" | "APPROVED_DIRECTOR" | "REJECTED" | "DISBURSED";
type BailoutCategory = "TRANSPORT" | "HOTEL" | "MEAL" | "OTHER";
type TransportMode = "FLIGHT" | "TRAIN" | "BUS" | "FERRY" | "CAR_RENTAL" | "OTHER";

interface TravelRequestRef {
  id: string;
  requestNumber: string;
  destination: string;
  status: string;
}

interface Bailout {
  id: string;
  bailoutNumber: string;
  description: string;
  amount: number | string;
  status: BailoutStatus;
  submittedAt: string | Date | null;
  chiefApprovedAt: string | Date | null;
  directorApprovedAt: string | Date | null;
  disbursedAt: string | Date | null;
  rejectedAt: string | Date | null;
  rejectionReason: string | null;
  travelRequest: { id: string; requestNumber: string; destination: string };
  requester: { id: string; name: string | null; employeeId: string | null };
  finance?: { id: string; name: string | null; email: string | null } | null;
  chiefApprover?: { id: string; name: string | null } | null;
  directorApprover?: { id: string; name: string | null } | null;
  category: BailoutCategory;
  storageUrl: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(d: string | Date | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}
function currency(n: number | string) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(Number(n));
}

const STATUS_LABELS: Record<BailoutStatus, string> = {
  DRAFT: "Draft", SUBMITTED: "Diajukan", APPROVED_CHIEF: "Disetujui Chief",
  APPROVED_DIRECTOR: "Disetujui Direktur", REJECTED: "Ditolak", DISBURSED: "Dicairkan",
};
const STATUS_COLORS: Record<BailoutStatus, string> = {
  DRAFT: "bg-gray-100 text-gray-600", SUBMITTED: "bg-yellow-100 text-yellow-700",
  APPROVED_CHIEF: "bg-blue-100 text-blue-700", APPROVED_DIRECTOR: "bg-indigo-100 text-indigo-700",
  REJECTED: "bg-red-100 text-red-700", DISBURSED: "bg-green-100 text-green-700",
};

const FIELD_CLS = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
const LABEL_CLS = "block text-xs font-medium text-gray-700 mb-1";

// ─── Create Bailout Form ───────────────────────────────────────────────────────

function CreateBailoutModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [travelRequestId, setTravelRequestId] = useState("");
  const [category, setCategory] = useState<BailoutCategory>("OTHER");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  // Transport fields
  const [transportMode, setTransportMode] = useState<TransportMode>("FLIGHT");
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

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Travel requests eligible for bailout: sudah APPROVED atau LOCKED (sudah disetujui / sudah berangkat)
  const travelRequestQuery = api.travelRequest.getAll.useQuery({ limit: 100 }, { refetchOnWindowFocus: false });
  const rawTR = travelRequestQuery.data as { requests: TravelRequestRef[] } | undefined;
  const eligibleTravelRequests = (rawTR?.requests ?? [])
    .filter((tr) => ["APPROVED", "LOCKED", "APPROVED_L1", "APPROVED_L2", "APPROVED_L3", "APPROVED_L4", "APPROVED_L5"].includes(tr.status));

  const createMutation = api.bailout.create.useMutation({
    onSuccess: () => { onCreated(); onClose(); },
    onError: (err) => setErrors({ _global: err.message }),
  });

  const validate = () => {
    const e: Record<string, string> = {};
    if (!travelRequestId) e.travelRequestId = "Pilih perjalanan dinas terlebih dahulu";
    if (description.trim().length < 10) e.description = "Deskripsi minimal 10 karakter";
    if (!amount || Number(amount) <= 0) e.amount = "Jumlah harus lebih dari 0";
    if (category === "TRANSPORT") {
      if (!departureFrom) e.departureFrom = "Kota asal wajib diisi";
      if (!arrivalTo) e.arrivalTo = "Kota tujuan wajib diisi";
    }
    if (category === "HOTEL") {
      if (!hotelName) e.hotelName = "Nama hotel wajib diisi";
      if (!checkIn) e.checkIn = "Tanggal check-in wajib diisi";
      if (!checkOut) e.checkOut = "Tanggal check-out wajib diisi";
    }
    if (category === "MEAL" && !mealDate) e.mealDate = "Tanggal makan wajib diisi";
    return e;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setErrors({});

    createMutation.mutate({
      travelRequestId,
      category,
      description: description.trim(),
      amount: Number(amount),
      ...(category === "TRANSPORT" && {
        transportMode,
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

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {errors._global && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {errors._global}
        </div>
      )}

      {/* Travel Request */}
      <div>
        <label className={LABEL_CLS}>Perjalanan Dinas *</label>
        <select value={travelRequestId} onChange={(e) => setTravelRequestId(e.target.value)} className={FIELD_CLS}>
          <option value="">— Pilih perjalanan dinas —</option>
          {eligibleTravelRequests.map((tr) => (
            <option key={tr.id} value={tr.id}>
              {tr.requestNumber} — {tr.destination}
            </option>
          ))}
        </select>
        {eligibleTravelRequests.length === 0 && (
          <p className="mt-1 text-xs text-amber-600">
            Tidak ada perjalanan dinas yang sudah disetujui. Bailout hanya bisa diajukan untuk trip yang sudah approved.
          </p>
        )}
        {errors.travelRequestId && <p className="mt-1 text-xs text-red-600">{errors.travelRequestId}</p>}
      </div>

      {/* Category */}
      <div>
        <label className={LABEL_CLS}>Kategori *</label>
        <select value={category} onChange={(e) => setCategory(e.target.value as BailoutCategory)} className={FIELD_CLS}>
          <option value="TRANSPORT">Transport (Tiket)</option>
          <option value="HOTEL">Hotel (Akomodasi)</option>
          <option value="MEAL">Makan (Konsumsi)</option>
          <option value="OTHER">Lainnya</option>
        </select>
      </div>

      {/* Description */}
      <div>
        <label className={LABEL_CLS}>Deskripsi / Keperluan *</label>
        <textarea
          rows={2}
          className={FIELD_CLS}
          placeholder="Jelaskan keperluan dana talangan (min. 10 karakter)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        {errors.description && <p className="mt-1 text-xs text-red-600">{errors.description}</p>}
      </div>

      {/* Amount */}
      <div>
        <label className={LABEL_CLS}>Jumlah Dana (IDR) *</label>
        <input
          type="number"
          min={1}
          className={FIELD_CLS}
          placeholder="Contoh: 500000"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        {amount && Number(amount) > 0 && (
          <p className="mt-1 text-xs text-gray-500">{currency(Number(amount))}</p>
        )}
        {errors.amount && <p className="mt-1 text-xs text-red-600">{errors.amount}</p>}
      </div>

      {/* ── Transport Fields ── */}
      {category === "TRANSPORT" && (
        <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 space-y-3">
          <p className="text-xs font-semibold text-blue-700">Detail Transport</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL_CLS}>Moda Transport</label>
              <select value={transportMode} onChange={(e) => setTransportMode(e.target.value as TransportMode)} className={FIELD_CLS}>
                <option value="FLIGHT">Pesawat</option>
                <option value="TRAIN">Kereta</option>
                <option value="BUS">Bus</option>
                <option value="FERRY">Kapal</option>
                <option value="CAR_RENTAL">Sewa Mobil</option>
                <option value="OTHER">Lainnya</option>
              </select>
            </div>
            <div>
              <label className={LABEL_CLS}>Maskapai / Operator</label>
              <input type="text" className={FIELD_CLS} placeholder="Garuda, KAI, dll." value={carrier} onChange={(e) => setCarrier(e.target.value)} />
            </div>
            <div>
              <label className={LABEL_CLS}>Kota Asal *</label>
              <input type="text" className={FIELD_CLS} placeholder="Jakarta" value={departureFrom} onChange={(e) => setDepartureFrom(e.target.value)} />
              {errors.departureFrom && <p className="mt-1 text-xs text-red-600">{errors.departureFrom}</p>}
            </div>
            <div>
              <label className={LABEL_CLS}>Kota Tujuan *</label>
              <input type="text" className={FIELD_CLS} placeholder="Surabaya" value={arrivalTo} onChange={(e) => setArrivalTo(e.target.value)} />
              {errors.arrivalTo && <p className="mt-1 text-xs text-red-600">{errors.arrivalTo}</p>}
            </div>
            <div>
              <label className={LABEL_CLS}>Waktu Berangkat</label>
              <input type="datetime-local" className={FIELD_CLS} value={departureAt} onChange={(e) => setDepartureAt(e.target.value)} />
            </div>
            <div>
              <label className={LABEL_CLS}>Waktu Tiba</label>
              <input type="datetime-local" className={FIELD_CLS} value={arrivalAt} onChange={(e) => setArrivalAt(e.target.value)} />
            </div>
            <div>
              <label className={LABEL_CLS}>No. Penerbangan / Tiket</label>
              <input type="text" className={FIELD_CLS} placeholder="GA-123" value={flightNumber} onChange={(e) => setFlightNumber(e.target.value)} />
            </div>
            <div>
              <label className={LABEL_CLS}>Kelas</label>
              <input type="text" className={FIELD_CLS} placeholder="Economy / Business" value={seatClass} onChange={(e) => setSeatClass(e.target.value)} />
            </div>
            <div className="col-span-2">
              <label className={LABEL_CLS}>Booking Reference</label>
              <input type="text" className={FIELD_CLS} placeholder="ABC123" value={bookingRef} onChange={(e) => setBookingRef(e.target.value)} />
            </div>
          </div>
        </div>
      )}

      {/* ── Hotel Fields ── */}
      {category === "HOTEL" && (
        <div className="rounded-lg border border-indigo-100 bg-indigo-50 p-3 space-y-3">
          <p className="text-xs font-semibold text-indigo-700">Detail Hotel</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className={LABEL_CLS}>Nama Hotel *</label>
              <input type="text" className={FIELD_CLS} placeholder="Hotel Borobudur Jakarta" value={hotelName} onChange={(e) => setHotelName(e.target.value)} />
              {errors.hotelName && <p className="mt-1 text-xs text-red-600">{errors.hotelName}</p>}
            </div>
            <div className="col-span-2">
              <label className={LABEL_CLS}>Alamat Hotel</label>
              <input type="text" className={FIELD_CLS} placeholder="Jl. Lapangan Banteng Selatan..." value={hotelAddress} onChange={(e) => setHotelAddress(e.target.value)} />
            </div>
            <div>
              <label className={LABEL_CLS}>Check-in *</label>
              <input type="date" className={FIELD_CLS} value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
              {errors.checkIn && <p className="mt-1 text-xs text-red-600">{errors.checkIn}</p>}
            </div>
            <div>
              <label className={LABEL_CLS}>Check-out *</label>
              <input type="date" className={FIELD_CLS} value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
              {errors.checkOut && <p className="mt-1 text-xs text-red-600">{errors.checkOut}</p>}
            </div>
            <div>
              <label className={LABEL_CLS}>Tipe Kamar</label>
              <input type="text" className={FIELD_CLS} placeholder="Superior / Deluxe" value={roomType} onChange={(e) => setRoomType(e.target.value)} />
            </div>
          </div>
        </div>
      )}

      {/* ── Meal Fields ── */}
      {category === "MEAL" && (
        <div className="rounded-lg border border-green-100 bg-green-50 p-3 space-y-3">
          <p className="text-xs font-semibold text-green-700">Detail Makan</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL_CLS}>Tanggal Makan *</label>
              <input type="date" className={FIELD_CLS} value={mealDate} onChange={(e) => setMealDate(e.target.value)} />
              {errors.mealDate && <p className="mt-1 text-xs text-red-600">{errors.mealDate}</p>}
            </div>
            <div>
              <label className={LABEL_CLS}>Lokasi</label>
              <input type="text" className={FIELD_CLS} placeholder="Restoran / Warung / Hotel" value={mealLocation} onChange={(e) => setMealLocation(e.target.value)} />
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
        <Button type="button" variant="secondary" onClick={onClose}>Batal</Button>
        <Button type="submit" isLoading={createMutation.isPending}>
          Simpan sebagai Draft
        </Button>
      </div>
    </form>
  );
}

// ─── Action Modal ─────────────────────────────────────────────────────────────

function ActionModal({
  bailout,
  onClose,
  onDone,
  userRole,
  currentUserId,
}: {
  bailout: Bailout;
  onClose: () => void;
  onDone: () => void;
  userRole: string;
  currentUserId: string;
}) {
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [showDisburse, setShowDisburse] = useState(false);
  const [disbursementRef, setDisbursementRef] = useState("");
  const [currentStorageUrl, setCurrentStorageUrl] = useState(bailout.storageUrl);

  const chiefRoles = ["SALES_CHIEF", "MANAGER", "DIRECTOR", "ADMIN"];
  const directorRoles = ["DIRECTOR", "ADMIN"];
  const financeRoles = ["FINANCE", "ADMIN"];

  const utils = api.useUtils();
  const refresh = () => { void utils.bailout.getAll.invalidate(); onDone(); onClose(); };

  const approveChief = api.bailout.approveByChief.useMutation({ onSuccess: refresh });
  const approveDirector = api.bailout.approveByDirector.useMutation({ onSuccess: refresh });
  const reject = api.bailout.reject.useMutation({ onSuccess: refresh });
  const disburse = api.bailout.disburse.useMutation({ onSuccess: refresh });
  const submit = api.bailout.submit.useMutation({ onSuccess: refresh });

  const isActing = approveChief.isPending || approveDirector.isPending || reject.isPending || disburse.isPending || submit.isPending;

  return (
    <div className="space-y-5">
      {/* Bailout Info */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="font-mono text-sm font-bold text-gray-800">{bailout.bailoutNumber}</p>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_COLORS[bailout.status]}`}>
            {STATUS_LABELS[bailout.status]}
          </span>
        </div>
        <div className="rounded-lg bg-blue-50 border border-blue-100 px-3 py-2 text-xs">
          <p className="font-medium text-blue-700">{bailout.travelRequest.requestNumber}</p>
          <p className="text-blue-500">{bailout.travelRequest.destination}</p>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><p className="text-xs text-gray-400">Pemohon</p><p className="font-medium">{bailout.requester.name ?? "—"}</p></div>
          <div><p className="text-xs text-gray-400">Jumlah</p><p className="font-bold text-gray-900">{currency(bailout.amount)}</p></div>
          <div><p className="text-xs text-gray-400">Finance</p><p className="font-medium text-blue-700">{bailout.finance?.name ?? <span className="text-gray-400">—</span>}</p></div>
          <div className="col-span-2"><p className="text-xs text-gray-400">Deskripsi</p><p className="text-gray-700">{bailout.description}</p></div>
        </div>
        {bailout.status === "REJECTED" && bailout.rejectionReason && (
          <div className="rounded bg-red-50 border border-red-200 px-3 py-2">
            <p className="text-xs font-semibold text-red-700">Alasan penolakan:</p>
            <p className="text-xs text-gray-700">{bailout.rejectionReason}</p>
          </div>
        )}
      </div>

      {/* Bukti pembayaran — hanya tampil setelah dicairkan */}
      {bailout.status === "DISBURSED" && currentStorageUrl && (
        <div className="rounded-lg border border-green-100 bg-green-50 p-3">
          <p className="text-xs font-semibold text-green-700 mb-2">Bukti Pembayaran</p>
          <BailoutFileUpload
            bailoutId={bailout.id}
            category={bailout.category}
            currentUrl={currentStorageUrl}
            onUploaded={(key) => setCurrentStorageUrl(key)}
          />
        </div>
      )}

      {/* Reject Form */}
      {showReject && (
        <div className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-3">
          <p className="text-sm font-medium text-red-700">Alasan Penolakan</p>
          <textarea
            rows={3}
            className="w-full rounded border border-red-300 px-3 py-2 text-sm bg-white focus:outline-none"
            placeholder="Jelaskan alasan penolakan (min. 5 karakter)..."
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
          />
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowReject(false)} className="text-xs text-gray-500">Batal</button>
            <Button variant="destructive" isLoading={reject.isPending}
              onClick={() => { if (rejectReason.trim().length >= 5) reject.mutate({ id: bailout.id, rejectionReason: rejectReason }); }}>
              Konfirmasi Tolak
            </Button>
          </div>
        </div>
      )}

      {/* Disburse Form */}
      {showDisburse && (
        <div className="space-y-2 rounded-lg border border-green-200 bg-green-50 p-3">
          <p className="text-sm font-medium text-green-700">Konfirmasi Pencairan Dana</p>
          <div>
            <label className="text-xs text-gray-500 block mb-1">No. Referensi Transfer (opsional)</label>
            <input
              type="text"
              className="w-full rounded border border-green-300 px-3 py-2 text-sm bg-white focus:outline-none"
              placeholder="Contoh: TRF-20260304-001"
              value={disbursementRef}
              onChange={(e) => setDisbursementRef(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-2">Upload Bukti Pembayaran / Tiket (opsional)</label>
            <BailoutFileUpload
              bailoutId={bailout.id}
              category={bailout.category}
              currentUrl={currentStorageUrl}
              onUploaded={(key) => setCurrentStorageUrl(key)}
            />
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowDisburse(false)} className="text-xs text-gray-500">Batal</button>
            <Button isLoading={disburse.isPending}
              onClick={() => disburse.mutate({
                id: bailout.id,
                disbursementRef: disbursementRef || undefined,
              })}>
              ✓ Konfirmasi Cairkan
            </Button>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-wrap justify-end gap-2 border-t border-gray-100 pt-4">
        <Button variant="secondary" onClick={onClose}>Tutup</Button>
        {bailout.status === "DRAFT" && bailout.requester.id === currentUserId && (
          <Button isLoading={submit.isPending} onClick={() => submit.mutate({ id: bailout.id })}>
            Kirim Pengajuan
          </Button>
        )}
        {!showReject && chiefRoles.includes(userRole) && ["SUBMITTED", "APPROVED_CHIEF"].includes(bailout.status) && (
          <button onClick={() => setShowReject(true)} disabled={isActing}
            className="rounded px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 border border-red-200">
            Tolak
          </button>
        )}
        {chiefRoles.includes(userRole) && bailout.status === "SUBMITTED" && (
          <Button isLoading={approveChief.isPending} onClick={() => approveChief.mutate({ id: bailout.id })}>
            ✓ Setujui (Chief)
          </Button>
        )}
        {directorRoles.includes(userRole) && bailout.status === "APPROVED_CHIEF" && (
          <Button isLoading={approveDirector.isPending} onClick={() => approveDirector.mutate({ id: bailout.id })}>
            ✓ Setujui (Direktur)
          </Button>
        )}
        {financeRoles.includes(userRole) && bailout.status === "APPROVED_DIRECTOR" && !showDisburse && (
          <Button isLoading={disburse.isPending} onClick={() => setShowDisburse(true)}>
            💰 Cairkan Dana
          </Button>
        )}
      </div>
    </div>
  );
}

// Stable selector — must be defined outside the component to avoid
// React Query treating each render's new function reference as changed
// options and infinitely re-fetching.
function selectBailouts(d: { bailouts: Bailout[] }) {
  return d.bailouts;
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BailoutApprovalPage() {
  const { data: session } = useSession();
  const userRole = session?.user?.role ?? "EMPLOYEE";
  const currentUserId = session?.user?.id ?? "";

  const [statusFilter, setStatusFilter] = useState<BailoutStatus | "ALL">("ALL");
  const [selected, setSelected] = useState<Bailout | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const utils = api.useUtils();

  // Single query with no status filter so we always have the full list.
  // „select" uses a stable function reference to avoid infinite re-fetches.
  const { data: allBailouts = [], isLoading } = api.bailout.getAll.useQuery(
    { limit: 500 },
    { select: selectBailouts },
  );

  // Derive the filtered list and the pending count from the same data.
  const bailouts = statusFilter === "ALL"
    ? allBailouts
    : allBailouts.filter(b => b.status === statusFilter);
  const pendingCount = allBailouts.filter(b =>
    ["SUBMITTED", "APPROVED_CHIEF", "APPROVED_DIRECTOR"].includes(b.status)
  ).length;

  const statusFilters: { value: BailoutStatus | "ALL"; label: string }[] = [
    { value: "ALL", label: "Semua" },
    { value: "SUBMITTED", label: "Diajukan" },
    { value: "APPROVED_CHIEF", label: "Tunggu Direktur" },
    { value: "APPROVED_DIRECTOR", label: "Siap Cair" },
    { value: "DISBURSED", label: "Dicairkan" },
    { value: "REJECTED", label: "Ditolak" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bailout Approval"
        description="Kelola dan setujui pengajuan dana talangan perjalanan dinas"
        primaryAction={{
          label: "Ajukan Bailout",
          onClick: () => setIsCreateOpen(true),
        }}
      />

      {/* Pending Summary */}
      {pendingCount > 0 && (
        <div className="rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3">
          <p className="text-sm font-medium text-yellow-800">
            ⏳ Ada <strong>{pendingCount}</strong> pengajuan bailout yang menunggu tindakan Anda
          </p>
        </div>
      )}

      {/* Status Filters */}
      <div className="flex flex-wrap gap-2">
        {statusFilters.map(f => (
          <button key={f.value} onClick={() => setStatusFilter(f.value)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${statusFilter === f.value ? "bg-blue-600 text-white shadow-sm" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
            {f.label}
          </button>
        ))}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
        </div>
      ) : bailouts.length === 0 ? (
        <EmptyState
          icon="✅"
          title={statusFilter === "ALL" ? "Belum Ada Bailout" : `Tidak ada bailout berstatus "${STATUS_LABELS[statusFilter]}"`}
          description="Bailout akan muncul di sini setelah user mengajukannya dari halaman BusTrip."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-4 py-3">No. Bailout</th>
                <th className="px-4 py-3">Perjalanan Dinas</th>
                <th className="px-4 py-3">Pemohon</th>
                <th className="px-4 py-3">Deskripsi</th>
                <th className="px-4 py-3 text-right">Jumlah</th>
                <th className="px-4 py-3 text-center">Finance</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-center">Tanggal</th>
                <th className="px-4 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {bailouts.map(b => (
                <tr key={b.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs font-semibold text-gray-700">{b.bailoutNumber}</td>
                  <td className="px-4 py-3">
                    <p className="text-xs font-medium text-gray-700">{b.travelRequest.requestNumber}</p>
                    <p className="text-xs text-gray-400 truncate max-w-[120px]">{b.travelRequest.destination}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600">{b.requester.name ?? "—"}</td>
                  <td className="px-4 py-3">
                    <p className="text-xs text-gray-600 truncate max-w-[180px]">{b.description}</p>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-xs">{currency(b.amount)}</td>
                  <td className="px-4 py-3 text-center">
                    {b.finance ? (
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 border border-blue-100">
                        {b.finance.name ?? "—"}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_COLORS[b.status]}`}>
                      {STATUS_LABELS[b.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-xs text-gray-400">
                    {fmt(b.submittedAt ?? null)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => setSelected(b)}
                      className="rounded px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50">
                      Proses
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t bg-gray-50 px-4 py-2 text-xs text-gray-400">
            {bailouts.length} entri
          </div>
        </div>
      )}

      {/* Action Modal */}
      <Modal isOpen={!!selected} onClose={() => setSelected(null)} title="Proses Bailout" size="md">
        {selected && (
          <ActionModal
            bailout={selected}
            onClose={() => setSelected(null)}
            onDone={() => void utils.bailout.getAll.invalidate()}
            userRole={userRole}
            currentUserId={currentUserId}
          />
        )}
      </Modal>

      {/* Create Bailout Modal */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Ajukan Dana Talangan (Bailout)"
        size="lg"
      >
        <CreateBailoutModal
          onClose={() => setIsCreateOpen(false)}
          onCreated={() => void utils.bailout.getAll.invalidate()}
        />
      </Modal>
    </div>
  );
}
