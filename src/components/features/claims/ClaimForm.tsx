"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import type { EntertainmentType, NonEntertainmentCategory } from "../../../../generated/prisma";

export type ClaimFormType = "ENTERTAINMENT" | "NON_ENTERTAINMENT";

// ── Shared ──────────────────────────────────────────────────────────────────
export interface ClaimFormBase {
  travelRequestId: string;
  amount: string;
  description: string;
  notes: string;
}

// ── Entertainment ────────────────────────────────────────────────────────────
export interface EntertainmentFormData extends ClaimFormBase {
  claimType: "ENTERTAINMENT";
  entertainmentType: EntertainmentType;
  entertainmentDate: string;
  entertainmentLocation: string;
  entertainmentAddress: string;
  guestName: string;
  guestCompany: string;
  guestPosition: string;
  isGovernmentOfficial: boolean;
}

// ── Non-Entertainment ────────────────────────────────────────────────────────
export interface NonEntertainmentFormData extends ClaimFormBase {
  claimType: "NON_ENTERTAINMENT";
  expenseCategory: NonEntertainmentCategory;
  expenseDate: string;
  expenseDestination: string;
  customerName: string;
}

export type ClaimFormData = EntertainmentFormData | NonEntertainmentFormData;

interface TravelRequestOption {
  id: string;
  requestNumber: string;
  destination: string;
}

interface ClaimFormProps {
  travelRequests: TravelRequestOption[];
  initialType?: ClaimFormType;
  initialData?: Partial<ClaimFormData>;
  isLoading?: boolean;
  onSubmit: (data: ClaimFormData) => void;
  onCancel: () => void;
}

const ENTERTAINMENT_TYPES: { value: EntertainmentType; label: string }[] = [
  { value: "MEAL", label: "Meal" },
  { value: "GIFT", label: "Gift" },
  { value: "EVENT", label: "Event" },
  { value: "HOSPITALITY", label: "Hospitality" },
  { value: "OTHER", label: "Other" },
];

const NON_ENTERTAINMENT_CATEGORIES: { value: NonEntertainmentCategory; label: string }[] = [
  { value: "TRANSPORT", label: "Transport" },
  { value: "PHONE_BILLING", label: "Phone / Billing" },
  { value: "TRAVEL_EXPENSES", label: "Travel Expenses" },
  { value: "OVERTIME_MEALS", label: "Overtime Meals" },
  { value: "BPJS_HEALTH", label: "BPJS Health" },
  { value: "EQUIPMENT_STATIONERY", label: "Equipment / Stationery" },
  { value: "MOTORCYCLE_SERVICE", label: "Motorcycle Service" },
  { value: "ACCOMMODATION", label: "Accommodation" },
  { value: "OTHER", label: "Other" },
];

const FIELD_CLS =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
const LABEL_CLS = "mb-1 block text-sm font-medium text-gray-700";
const ERROR_CLS = "mt-1 text-xs text-red-500";

export function ClaimForm({
  travelRequests,
  initialType = "NON_ENTERTAINMENT",
  initialData,
  isLoading = false,
  onSubmit,
  onCancel,
}: ClaimFormProps) {
  const [claimType, setClaimType] = useState<ClaimFormType>(
    initialData?.claimType ?? initialType
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Shared fields
  const [travelRequestId, setTravelRequestId] = useState(
    initialData?.travelRequestId ?? (travelRequests[0]?.id ?? "")
  );
  const [amount, setAmount] = useState(initialData?.amount ?? "");
  const [description, setDescription] = useState(initialData?.description ?? "");
  const [notes, setNotes] = useState(initialData?.notes ?? "");

  // Entertainment fields
  const entInitial = initialData as Partial<EntertainmentFormData> | undefined;
  const [entertainmentType, setEntertainmentType] = useState<EntertainmentType>(
    entInitial?.entertainmentType ?? "MEAL"
  );
  const [entertainmentDate, setEntertainmentDate] = useState(entInitial?.entertainmentDate ?? "");
  const [entertainmentLocation, setEntertainmentLocation] = useState(
    entInitial?.entertainmentLocation ?? ""
  );
  const [entertainmentAddress, setEntertainmentAddress] = useState(
    entInitial?.entertainmentAddress ?? ""
  );
  const [guestName, setGuestName] = useState(entInitial?.guestName ?? "");
  const [guestCompany, setGuestCompany] = useState(entInitial?.guestCompany ?? "");
  const [guestPosition, setGuestPosition] = useState(entInitial?.guestPosition ?? "");
  const [isGovernmentOfficial, setIsGovernmentOfficial] = useState(
    entInitial?.isGovernmentOfficial ?? false
  );

  // Non-entertainment fields
  const nonEntInitial = initialData as Partial<NonEntertainmentFormData> | undefined;
  const [expenseCategory, setExpenseCategory] = useState<NonEntertainmentCategory>(
    nonEntInitial?.expenseCategory ?? "TRANSPORT"
  );
  const [expenseDate, setExpenseDate] = useState(nonEntInitial?.expenseDate ?? "");
  const [expenseDestination, setExpenseDestination] = useState(
    nonEntInitial?.expenseDestination ?? ""
  );
  const [customerName, setCustomerName] = useState(nonEntInitial?.customerName ?? "");

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!travelRequestId) errs.travelRequestId = "Please select a travel request";
    if (!amount || Number(amount) <= 0) errs.amount = "Amount must be positive";
    if (!description || description.length < 10)
      errs.description = "Description must be at least 10 characters";

    if (claimType === "ENTERTAINMENT") {
      if (!entertainmentDate) errs.entertainmentDate = "Date is required";
      if (!entertainmentLocation) errs.entertainmentLocation = "Location is required";
      if (!guestName) errs.guestName = "Guest name is required";
    } else {
      if (!expenseDate) errs.expenseDate = "Date is required";
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    if (claimType === "ENTERTAINMENT") {
      onSubmit({
        claimType: "ENTERTAINMENT",
        travelRequestId,
        entertainmentType,
        entertainmentDate,
        entertainmentLocation,
        entertainmentAddress,
        guestName,
        guestCompany,
        guestPosition,
        isGovernmentOfficial,
        amount,
        description,
        notes,
      });
    } else {
      onSubmit({
        claimType: "NON_ENTERTAINMENT",
        travelRequestId,
        expenseCategory,
        expenseDate,
        expenseDestination,
        customerName,
        amount,
        description,
        notes,
      });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Claim type switcher */}
      <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-1">
        <button
          type="button"
          onClick={() => setClaimType("NON_ENTERTAINMENT")}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            claimType === "NON_ENTERTAINMENT"
              ? "bg-white text-blue-700 shadow-sm"
              : "text-gray-600 hover:text-gray-900"
          }`}
        >
          Non-Entertainment
        </button>
        <button
          type="button"
          onClick={() => setClaimType("ENTERTAINMENT")}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            claimType === "ENTERTAINMENT"
              ? "bg-white text-blue-700 shadow-sm"
              : "text-gray-600 hover:text-gray-900"
          }`}
        >
          Entertainment
        </button>
      </div>

      {/* Travel Request */}
      <div>
        <label className={LABEL_CLS}>Travel Request *</label>
        <select
          value={travelRequestId}
          onChange={(e) => setTravelRequestId(e.target.value)}
          className={FIELD_CLS}
        >
          {travelRequests.length === 0 && (
            <option value="">No approved travel requests</option>
          )}
          {travelRequests.map((tr) => (
            <option key={tr.id} value={tr.id}>
              {tr.requestNumber} — {tr.destination}
            </option>
          ))}
        </select>
        {errors.travelRequestId && <p className={ERROR_CLS}>{errors.travelRequestId}</p>}
      </div>

      {/* ── Entertainment specific fields ── */}
      {claimType === "ENTERTAINMENT" && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LABEL_CLS}>Entertainment Type *</label>
              <select
                value={entertainmentType}
                onChange={(e) => setEntertainmentType(e.target.value as EntertainmentType)}
                className={FIELD_CLS}
              >
                {ENTERTAINMENT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL_CLS}>Date *</label>
              <input
                type="date"
                value={entertainmentDate}
                onChange={(e) => setEntertainmentDate(e.target.value)}
                className={FIELD_CLS}
              />
              {errors.entertainmentDate && <p className={ERROR_CLS}>{errors.entertainmentDate}</p>}
            </div>
          </div>

          <div>
            <label className={LABEL_CLS}>Location *</label>
            <input
              type="text"
              value={entertainmentLocation}
              onChange={(e) => setEntertainmentLocation(e.target.value)}
              placeholder="Restaurant / venue name"
              className={FIELD_CLS}
            />
            {errors.entertainmentLocation && (
              <p className={ERROR_CLS}>{errors.entertainmentLocation}</p>
            )}
          </div>

          <div>
            <label className={LABEL_CLS}>Address</label>
            <input
              type="text"
              value={entertainmentAddress}
              onChange={(e) => setEntertainmentAddress(e.target.value)}
              placeholder="Full address (optional)"
              className={FIELD_CLS}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LABEL_CLS}>Guest Name *</label>
              <input
                type="text"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                className={FIELD_CLS}
              />
              {errors.guestName && <p className={ERROR_CLS}>{errors.guestName}</p>}
            </div>
            <div>
              <label className={LABEL_CLS}>Guest Company</label>
              <input
                type="text"
                value={guestCompany}
                onChange={(e) => setGuestCompany(e.target.value)}
                className={FIELD_CLS}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LABEL_CLS}>Guest Position</label>
              <input
                type="text"
                value={guestPosition}
                onChange={(e) => setGuestPosition(e.target.value)}
                className={FIELD_CLS}
              />
            </div>
            <div className="flex items-end pb-2">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={isGovernmentOfficial}
                  onChange={(e) => setIsGovernmentOfficial(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600"
                />
                Government Official
              </label>
            </div>
          </div>
        </>
      )}

      {/* ── Non-Entertainment specific fields ── */}
      {claimType === "NON_ENTERTAINMENT" && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LABEL_CLS}>Expense Category *</label>
              <select
                value={expenseCategory}
                onChange={(e) => setExpenseCategory(e.target.value as NonEntertainmentCategory)}
                className={FIELD_CLS}
              >
                {NON_ENTERTAINMENT_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL_CLS}>Expense Date *</label>
              <input
                type="date"
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
                className={FIELD_CLS}
              />
              {errors.expenseDate && <p className={ERROR_CLS}>{errors.expenseDate}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LABEL_CLS}>Destination</label>
              <input
                type="text"
                value={expenseDestination}
                onChange={(e) => setExpenseDestination(e.target.value)}
                placeholder="e.g. Jakarta → Surabaya"
                className={FIELD_CLS}
              />
            </div>
            <div>
              <label className={LABEL_CLS}>Customer Name</label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className={FIELD_CLS}
              />
            </div>
          </div>
        </>
      )}

      {/* ── Shared fields ── */}
      <div>
        <label className={LABEL_CLS}>Amount (IDR) *</label>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0"
          min="0"
          step="1000"
          className={FIELD_CLS}
        />
        {errors.amount && <p className={ERROR_CLS}>{errors.amount}</p>}
      </div>

      <div>
        <label className={LABEL_CLS}>Description *</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="Describe the purpose of this expense (min. 10 characters)"
          className={`${FIELD_CLS} resize-none`}
        />
        {errors.description && <p className={ERROR_CLS}>{errors.description}</p>}
      </div>

      <div>
        <label className={LABEL_CLS}>Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Additional notes (optional)"
          className={`${FIELD_CLS} resize-none`}
        />
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 border-t pt-4">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={isLoading}>
          Cancel
        </Button>
        <Button type="submit" isLoading={isLoading}>
          Save Claim
        </Button>
      </div>
    </form>
  );
}
