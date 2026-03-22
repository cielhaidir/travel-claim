export type CreateApprovalLogInput = {
  moduleName: "overtime" | "leave";
  referenceId: string;
  action: "submit" | "approve" | "reject" | "cancel" | "revise";
  actorUserId: string;
  notes?: string;
};

export async function createApprovalLog(
  deps: {
    create: (input: CreateApprovalLogInput) => Promise<void>;
  },
  input: CreateApprovalLogInput,
): Promise<void> {
  await deps.create(input);
}
