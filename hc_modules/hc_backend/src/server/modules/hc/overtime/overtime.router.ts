import {
  overtimeApproveSchema,
  overtimeListSchema,
  overtimeRejectSchema,
  overtimeSubmitSchema,
} from "@/server/modules/hc/overtime/overtime.schema";

export const overtimeRouterContract = {
  submit: overtimeSubmitSchema,
  approve: overtimeApproveSchema,
  reject: overtimeRejectSchema,
  list: overtimeListSchema,
};
