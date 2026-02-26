"use client";

import { useState } from "react";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/Button";
import type { TravelType } from "../../../../generated/prisma";

// â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export type BailoutCategory = "TRANSPORT" | "HOTEL" | "MEAL" | "OTHER";

export interface BailoutItemData {
  category: BailoutCategory;
  description: string;
  amount: number;
  // Transport
  transportMode?: string;
  carrier?: string;
  departureFrom?: string;
  arrivalTo?: string;
  departureAt?: string;
  arrivalAt?: string;
  flightNumber?: string;
  seatClass?: string;
  bookingRef?: string;
  // Hotel
  hotelName?: string;
  hotelAddress?: string;
  checkIn?: string;
  checkOut?: string;
  roomType?: string;
  // Meal
  mealDate?: string;
  mealLocation?: string;
}

export interface TravelRequestFormData {
  purpose: string;
  destination: string;
  travelType: TravelType;
  startDate: string;
  endDate: string;
  projectId?: string;
  bailouts?: BailoutItemData[];
}

// â”€â”€â”€ Constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const TRAVEL_TYPES: Array<{ value: TravelType; label: string }> = [
  { value: "SALES", label: "Sales" },
  { value: "OPERATIONAL", label: "Operational" },
  { value: "MEETING", label: "Meeting" },
  { value: "TRAINING", label: "Training" },
];

const CATEGORY_OPTIONS: Array<{ value: BailoutCategory; label: string; icon: string; desc: string }> = [
  { value: "TRANSPORT", label: "Transportasi", icon: "âœˆï¸", desc: "Tiket pesawat, kereta, bus, dll" },
  { value: "HOTEL", label: "Penginapan", icon: "🏨", desc: "Hotel, homestay, dll" },
  { value: "MEAL", label: "Uang Makan", icon: "🍽️", desc: "Makan & konsumsi perjalanan" },
  { value: "OTHER", label: "Lainnya", icon: "📦", desc: "Kebutuhan lain di luar kategori di atas" },
];

const TRANSPORT_MODES: Array<{ value: string; label: string }> = [
  { value: "FLIGHT", label: "âœˆï¸ Pesawat" },
  { value: "TRAIN", label: "🚂 Kereta" },
  { value: "BUS", label: "🚌 Bus" },
  { value: "CAR_RENTAL", label: "🚗 Rental Mobil" },
  { value: "FERRY", label: "🚢 Kapal" },
  { value: "OTHER", label: "🔄 Lainnya" },
];

const DEFAULT_BAILOUT = (category: BailoutCategory = "OTHER"): BailoutItemData => ({
  category,
  description: "",
  amount: 0,
});

// â”€â”€â”€ Props â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface TravelRequestFormProps {
  initialData?: Partial<TravelRequestFormData>;
  isLoading?: boolean;
  onSubmit: (data: TravelRequestFormData) => void;
  onCancel: () => void;
}

// â”€â”€â”€ Single Bailout Item Form â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function BailoutItemForm({
  item,
  index,
  onChange,
  onRemove,
  errors,
}: {
  item: BailoutItemData;
  index: number;
  onChange: (i: number, patch: Partial<BailoutItemData>) => void;
  onRemove: (i: number) => void;
  errors: Record<string, string | undefined>;
}) {
  const set = (patch: Partial<BailoutItemData>) => onChange(index, patch);
  const inputCls = (key: string) =>
    `w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
      errors[key] ? "border-red-400 bg-red-50" : "border-gray-300"
    }`;

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-700">Dana Talangan #{index + 1}</p>
        <button type="button" onClick={() => onRemove(index)} className="text-xs text-red-500 hover:text-red-700">Hapus</button>
      </div>

      {/* Category Selector */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-gray-600">Kategori *</label>
        <div className="grid grid-cols-2 gap-2">
          {CATEGORY_OPTIONS.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => set({ category: c.value })}
              className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                item.category === c.value
                  ? "border-blue-500 bg-blue-50 text-blue-800"
                  : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
              }`}
            >
              <span className="text-base leading-none">{c.icon}</span>
              <span>
                <span className="block font-semibold">{c.label}</span>
                <span className="text-gray-400">{c.desc}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Transport-specific */}
      {item.category === "TRANSPORT" && (
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="mb-1 block text-xs font-medium text-gray-600">Mode Transportasi *</label>
            <select className={inputCls(`b${index}_tmode`)} value={item.transportMode ?? "FLIGHT"} onChange={(e) => set({ transportMode: e.target.value })}>
              {TRANSPORT_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Dari *</label>
            <input type="text" className={inputCls(`b${index}_from`)} placeholder="cth. Ternate" value={item.departureFrom ?? ""} onChange={(e) => set({ departureFrom: e.target.value })} />
            {errors[`b${index}_from`] && <p className="mt-1 text-xs text-red-500">{errors[`b${index}_from`]}</p>}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Tujuan *</label>
            <input type="text" className={inputCls(`b${index}_to`)} placeholder="cth. Jakarta" value={item.arrivalTo ?? ""} onChange={(e) => set({ arrivalTo: e.target.value })} />
            {errors[`b${index}_to`] && <p className="mt-1 text-xs text-red-500">{errors[`b${index}_to`]}</p>}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Tgl Berangkat *</label>
            <input type="date" className={inputCls(`b${index}_depDate`)} value={item.departureAt ?? ""} onChange={(e) => set({ departureAt: e.target.value })} />
            {errors[`b${index}_depDate`] && <p className="mt-1 text-xs text-red-500">{errors[`b${index}_depDate`]}</p>}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Tgl Tiba</label>
            <input type="date" className={inputCls(`b${index}_arrDate`)} value={item.arrivalAt ?? ""} min={item.departureAt ?? ""} onChange={(e) => set({ arrivalAt: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Maskapai / Operator</label>
            <input type="text" className={inputCls(`b${index}_carrier`)} placeholder="cth. Garuda Indonesia" value={item.carrier ?? ""} onChange={(e) => set({ carrier: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">No. Penerbangan</label>
            <input type="text" className={inputCls(`b${index}_flight`)} placeholder="cth. GA-415" value={item.flightNumber ?? ""} onChange={(e) => set({ flightNumber: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Kelas</label>
            <input type="text" className={inputCls(`b${index}_seat`)} placeholder="cth. Economy" value={item.seatClass ?? ""} onChange={(e) => set({ seatClass: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">No. Booking</label>
            <input type="text" className={inputCls(`b${index}_ref`)} placeholder="cth. ABC-123" value={item.bookingRef ?? ""} onChange={(e) => set({ bookingRef: e.target.value })} />
          </div>
        </div>
      )}

      {/* Hotel-specific */}
      {item.category === "HOTEL" && (
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="mb-1 block text-xs font-medium text-gray-600">Nama Hotel *</label>
            <input type="text" className={inputCls(`b${index}_hotel`)} placeholder="cth. Hotel Grand Mercure" value={item.hotelName ?? ""} onChange={(e) => set({ hotelName: e.target.value })} />
            {errors[`b${index}_hotel`] && <p className="mt-1 text-xs text-red-500">{errors[`b${index}_hotel`]}</p>}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Check-in *</label>
            <input type="date" className={inputCls(`b${index}_ci`)} value={item.checkIn ?? ""} onChange={(e) => set({ checkIn: e.target.value })} />
            {errors[`b${index}_ci`] && <p className="mt-1 text-xs text-red-500">{errors[`b${index}_ci`]}</p>}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Check-out *</label>
            <input type="date" className={inputCls(`b${index}_co`)} value={item.checkOut ?? ""} min={item.checkIn ?? ""} onChange={(e) => set({ checkOut: e.target.value })} />
            {errors[`b${index}_co`] && <p className="mt-1 text-xs text-red-500">{errors[`b${index}_co`]}</p>}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Tipe Kamar</label>
            <input type="text" className={inputCls(`b${index}_room`)} placeholder="cth. Superior Twin" value={item.roomType ?? ""} onChange={(e) => set({ roomType: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Alamat</label>
            <input type="text" className={inputCls(`b${index}_addr`)} placeholder="Jl. ..." value={item.hotelAddress ?? ""} onChange={(e) => set({ hotelAddress: e.target.value })} />
          </div>
        </div>
      )}

      {/* Meal-specific */}
      {item.category === "MEAL" && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Tanggal</label>
            <input type="date" className={inputCls(`b${index}_mdate`)} value={item.mealDate ?? ""} onChange={(e) => set({ mealDate: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Lokasi</label>
            <input type="text" className={inputCls(`b${index}_mloc`)} placeholder="cth. Restoran Padang Jkt" value={item.mealLocation ?? ""} onChange={(e) => set({ mealLocation: e.target.value })} />
          </div>
        </div>
      )}

      {/* Common: Description + Amount */}
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Keterangan *</label>
          <textarea
            rows={2}
            className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors[`b${index}_desc`] ? "border-red-400 bg-red-50" : "border-gray-300"}`}
            placeholder="Deskripsikan kebutuhan dana talangan ini (min. 10 karakter)"
            value={item.description}
            onChange={(e) => set({ description: e.target.value })}
          />
          {errors[`b${index}_desc`] && <p className="mt-1 text-xs text-red-500">{errors[`b${index}_desc`]}</p>}
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Jumlah Dana (Rp) *</label>
          <input
            type="number"
            min={1}
            className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors[`b${index}_amt`] ? "border-red-400 bg-red-50" : "border-gray-300"}`}
            placeholder="cth. 2500000"
            value={item.amount || ""}
            onChange={(e) => set({ amount: parseFloat(e.target.value) || 0 })}
          />
          {errors[`b${index}_amt`] && <p className="mt-1 text-xs text-red-500">{errors[`b${index}_amt`]}</p>}
        </div>
      </div>
    </div>
  );
}

// â”€â”€â”€ Main Form Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function TravelRequestForm({
  initialData,
  isLoading,
  onSubmit,
  onCancel,
}: TravelRequestFormProps) {
  const [formData, setFormData] = useState<TravelRequestFormData>({
    purpose: initialData?.purpose ?? "",
    destination: initialData?.destination ?? "",
    travelType: initialData?.travelType ?? "MEETING",
    startDate: initialData?.startDate ?? "",
    endDate: initialData?.endDate ?? "",
    projectId: initialData?.projectId ?? "",
    bailouts: initialData?.bailouts ?? [],
  });

  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [activeTab, setActiveTab] = useState<"basic" | "bailout">("basic");

  const isSales = formData.travelType === "SALES";

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const { data: rawProjects } = api.project.getAll.useQuery(
    { isActive: true },
    { enabled: isSales }
  );
  const projects = (rawProjects as { projects: Array<{ id: string; code: string; name: string; clientName?: string | null }> } | undefined)?.projects ?? [];

  // â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const setField = (field: keyof TravelRequestFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const addBailout = (category: BailoutCategory = "OTHER") =>
    setFormData((prev) => ({ ...prev, bailouts: [...(prev.bailouts ?? []), DEFAULT_BAILOUT(category)] }));

  const removeBailout = (i: number) =>
    setFormData((prev) => ({ ...prev, bailouts: prev.bailouts?.filter((_, idx) => idx !== i) }));

  const updateBailout = (i: number, patch: Partial<BailoutItemData>) =>
    setFormData((prev) => ({
      ...prev,
      bailouts: prev.bailouts?.map((b, idx) => (idx === i ? { ...b, ...patch } : b)),
    }));

  // â”€â”€â”€ Validation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!formData.purpose.trim() || formData.purpose.length < 10)
      errs.purpose = "Purpose harus minimal 10 karakter";
    if (!formData.destination.trim()) errs.destination = "Destination wajib diisi";
    if (!formData.startDate) errs.startDate = "Tanggal mulai wajib diisi";
    if (!formData.endDate) errs.endDate = "Tanggal selesai wajib diisi";
    if (formData.startDate && formData.endDate && formData.startDate >= formData.endDate)
      errs.endDate = "Tanggal selesai harus setelah tanggal mulai";
    if (isSales && !formData.projectId)
      errs.projectId = "Project wajib dipilih untuk perjalanan Sales";

    formData.bailouts?.forEach((b, i) => {
      if (b.description.trim().length < 10) errs[`b${i}_desc`] = "Keterangan minimal 10 karakter";
      if (!b.amount || b.amount <= 0) errs[`b${i}_amt`] = "Jumlah harus > 0";
      if (b.category === "TRANSPORT") {
        if (!b.departureFrom?.trim()) errs[`b${i}_from`] = "Kota asal wajib diisi";
        if (!b.arrivalTo?.trim()) errs[`b${i}_to`] = "Kota tujuan wajib diisi";
        if (!b.departureAt) errs[`b${i}_depDate`] = "Tanggal berangkat wajib diisi";
      }
      if (b.category === "HOTEL") {
        if (!b.hotelName?.trim()) errs[`b${i}_hotel`] = "Nama hotel wajib diisi";
        if (!b.checkIn) errs[`b${i}_ci`] = "Check-in wajib diisi";
        if (!b.checkOut) errs[`b${i}_co`] = "Check-out wajib diisi";
      }
    });

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) {
      const errKeys = Object.keys(errors);
      if (errKeys.some((k) => k.startsWith("b"))) setActiveTab("bailout");
      else setActiveTab("basic");
      return;
    }
    onSubmit({
      ...formData,
      projectId: formData.projectId ?? undefined,
      bailouts: formData.bailouts?.filter((b) => b.description && b.amount > 0),
    });
  };

  const inputCls = (errKey: string) =>
    `w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
      errors[errKey] ? "border-red-400 bg-red-50" : "border-gray-300"
    }`;

  const bailoutCount = formData.bailouts?.length ?? 0;
  const totalBailout = formData.bailouts?.reduce((s, b) => s + (b.amount || 0), 0) ?? 0;

  // â”€â”€â”€ Render â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-0">
      {/* Tab Nav */}
      <div className="flex border-b border-gray-200 mb-4">
        {(["basic", "bailout"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab === "basic" && "📋 Informasi Dasar"}
            {tab === "bailout" && `💰 Dana Talangan ${bailoutCount > 0 ? `(${bailoutCount})` : "(opsional)"}`}
          </button>
        ))}
      </div>

      {/* â”€â”€ Tab: Basic Info â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {activeTab === "basic" && (
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Tujuan Perjalanan <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={3}
              className={inputCls("purpose")}
              placeholder="Deskripsikan tujuan perjalanan bisnis ini (min. 10 karakter)"
              value={formData.purpose}
              onChange={(e) => setField("purpose", e.target.value)}
            />
            {errors.purpose && <p className="mt-1 text-xs text-red-500">{errors.purpose}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Destinasi <span className="text-red-500">*</span></label>
              <input type="text" className={inputCls("destination")} placeholder="cth. Jakarta" value={formData.destination} onChange={(e) => setField("destination", e.target.value)} />
              {errors.destination && <p className="mt-1 text-xs text-red-500">{errors.destination}</p>}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Jenis Perjalanan <span className="text-red-500">*</span></label>
              <select className={inputCls("travelType")} value={formData.travelType} onChange={(e) => setField("travelType", e.target.value)}>
                {TRAVEL_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Tanggal Mulai <span className="text-red-500">*</span></label>
              <input type="date" className={inputCls("startDate")} value={formData.startDate} onChange={(e) => setField("startDate", e.target.value)} />
              {errors.startDate && <p className="mt-1 text-xs text-red-500">{errors.startDate}</p>}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Tanggal Selesai <span className="text-red-500">*</span></label>
              <input type="date" className={inputCls("endDate")} value={formData.endDate} min={formData.startDate} onChange={(e) => setField("endDate", e.target.value)} />
              {errors.endDate && <p className="mt-1 text-xs text-red-500">{errors.endDate}</p>}
            </div>
          </div>

          {isSales && (
            <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 space-y-3">
              <p className="text-sm font-semibold text-blue-800">📊 Informasi Sales</p>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Project <span className="text-red-500">*</span></label>
                <select className={inputCls("projectId")} value={formData.projectId ?? ""} onChange={(e) => setField("projectId", e.target.value)}>
                  <option value="">— Pilih Project —</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>[{p.code}] {p.name}{p.clientName ? ` — ${p.clientName}` : ""}</option>
                  ))}
                </select>
                {errors.projectId && <p className="mt-1 text-xs text-red-500">{errors.projectId}</p>}
                {projects.length === 0 && <p className="mt-1 text-xs text-amber-600">âš ï¸ Tidak ada project aktif.</p>}
              </div>
            </div>
          )}
        </div>
      )}

      {/* â”€â”€ Tab: Dana Talangan â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {activeTab === "bailout" && (
        <div className="space-y-4">
          <div className="rounded-lg border border-amber-100 bg-amber-50 p-3">
            <p className="text-sm font-semibold text-amber-800">💰 Dana Talangan (Opsional)</p>
            <p className="text-xs text-amber-700 mt-1">
              Tambahkan kebutuhan dana talangan — tiket, hotel, uang makan, dll. Bisa ditambah lagi setelah BusTrip disetujui.
            </p>
          </div>

          {bailoutCount > 0 && (
            <div className="flex gap-3 text-xs">
              <span className="rounded-full bg-gray-100 px-2 py-1 text-gray-600">{bailoutCount} item</span>
              <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-700">
                Total: {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(totalBailout)}
              </span>
            </div>
          )}

          {bailoutCount === 0 && (
            <div className="rounded-lg border-2 border-dashed border-gray-200 p-8 text-center">
              <p className="text-2xl">💰</p>
              <p className="mt-2 text-sm font-medium text-gray-600">Belum ada dana talangan</p>
              <p className="text-xs text-gray-400">Pilih kategori di bawah untuk menambahkan</p>
            </div>
          )}

          {formData.bailouts?.map((b, i) => (
            <BailoutItemForm key={i} item={b} index={i} onChange={updateBailout} onRemove={removeBailout} errors={errors} />
          ))}

          <div className="grid grid-cols-2 gap-2">
            {CATEGORY_OPTIONS.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => addBailout(c.value)}
                className="flex items-center gap-2 rounded-lg border-2 border-dashed border-amber-200 px-3 py-2.5 text-sm font-medium text-amber-600 hover:border-amber-400 hover:bg-amber-50 transition-colors"
              >
                <span>{c.icon}</span>
                <span>+ {c.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-between items-center border-t border-gray-100 pt-4 mt-4">
        <div className="text-xs text-gray-400">
          {bailoutCount > 0 && <span>💰 {bailoutCount} dana talangan</span>}
        </div>
        <div className="flex gap-3">
          <Button type="button" variant="secondary" onClick={onCancel} disabled={isLoading}>Batal</Button>
          <Button type="submit" isLoading={isLoading}>Simpan</Button>
        </div>
      </div>
    </form>
  );
}
