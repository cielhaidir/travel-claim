import {
  leaveApproveSchema,
  leaveListSchema,
  leaveRejectSchema,
  leaveSubmitSchema,
} from "@/server/modules/hc/leave/leave.schema";

export const leaveRouterContract = {
  submit: leaveSubmitSchema,
  approve: leaveApproveSchema,
  reject: leaveRejectSchema,
  list: leaveListSchema,
};
