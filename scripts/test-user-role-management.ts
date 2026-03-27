import { Role } from "../generated/prisma";
import { createCaller } from "../src/server/api/root";
import { resolveEffectivePermissions } from "../src/server/auth/permission-store";
import { db } from "../src/server/db";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function pass(label: string) {
  console.log(`PASS ${label}`);
}

async function makeCaller() {
  const operator = await db.user.findFirst({
    where: {
      deletedAt: null,
      role: {
        in: [Role.ROOT, Role.ADMIN],
      },
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      employeeId: true,
      departmentId: true,
      image: true,
    },
    orderBy: {
      role: "asc",
    },
  });

  assert(
    operator,
    "No ROOT or ADMIN user found. Seed the database before running this smoke test.",
  );

  const roles = [operator.role];
  const isRoot = operator.role === Role.ROOT;
  const permissions = await resolveEffectivePermissions(db, {
    roles,
    isRoot,
  });

  return createCaller({
    db,
    headers: new Headers(),
    session: {
      user: {
        id: operator.id,
        name: operator.name ?? "",
        email: operator.email ?? "",
        role: operator.role,
        roles,
        permissions,
        employeeId: operator.employeeId,
        departmentId: operator.departmentId,
        isRoot,
        image: operator.image ?? null,
      },
      expires: new Date(Date.now() + 60_000).toISOString(),
    },
  });
}

async function main() {
  console.log("Running user and role management smoke test...");

  const caller = await makeCaller();

  const roleProfiles = (await caller.role.getAll()) as Array<{
    role: Role;
    permissions: Record<string, string[]>;
  }>;
  assert(roleProfiles.length > 0, "Role management returned no profiles.");
  assert(
    roleProfiles.some((profile) => profile.role === Role.ADMIN),
    "ADMIN role profile is missing.",
  );
  pass("role.getAll returns the global role catalog");

  const listedUsers = (await caller.user.getAll({
    limit: 10,
  })) as {
    users: Array<{ id: string }>;
  };
  assert(Array.isArray(listedUsers.users), "User list payload is invalid.");
  pass("user.getAll returns a user list");

  const suffix = Date.now().toString().slice(-8);
  const email = `codex.user.${suffix}@example.com`;
  const employeeId = `UT${suffix}`;
  const initialPhone = "+620000000001";
  const updatedPhone = "+620000000002";

  const created = (await caller.user.create({
    name: "Codex Temp User",
    email,
    password: "TempPass123!",
    employeeId,
    role: Role.EMPLOYEE,
    departmentId: null,
    supervisorId: null,
    phoneNumber: initialPhone,
  })) as {
    id: string;
    role: Role;
    phoneNumber: string | null;
  };
  assert(created.id, "User creation did not return an id.");
  assert(created.role === Role.EMPLOYEE, "User creation returned the wrong role.");
  pass("user.create creates a global user without extra workspace context");

  const fetched = (await caller.user.getById({
    id: created.id,
  })) as {
    id: string;
    role: Role;
    phoneNumber: string | null;
  };
  assert(fetched.id === created.id, "Created user cannot be fetched by id.");
  assert(fetched.phoneNumber === initialPhone, "Fetched user has an unexpected phone number.");
  pass("user.getById can read the created user");

  const updated = (await caller.user.update({
    id: created.id,
    name: "Codex Temp Manager",
    email,
    employeeId,
    role: Role.MANAGER,
    departmentId: null,
    supervisorId: null,
    phoneNumber: updatedPhone,
  })) as {
    id: string;
    role: Role;
    phoneNumber: string | null;
    name: string | null;
  };
  assert(updated.role === Role.MANAGER, "User update did not persist the new role.");
  assert(updated.phoneNumber === updatedPhone, "User update did not persist the phone number.");
  assert(updated.name === "Codex Temp Manager", "User update did not persist the name.");
  pass("user.update persists global role assignment changes");

  const phoneLookup = (await caller.user.getByPhone({
    search: updatedPhone,
  })) as {
    user: { id: string } | null;
  };
  assert(phoneLookup.user?.id === created.id, "Phone lookup did not return the updated user.");
  pass("user.getByPhone reflects updated user data");

  const resetResult = await caller.user.resetPassword({
    id: created.id,
    newPassword: "ChangedPass123!",
  });
  assert(resetResult.success, "Password reset did not succeed.");
  pass("user.resetPassword works for the created user");

  const deleted = (await caller.user.delete({
    id: created.id,
  })) as {
    deletedAt: Date | string | null;
  };
  assert(deleted.deletedAt, "User delete did not soft-delete the record.");
  pass("user.delete soft-deletes the created user");

  const restored = (await caller.user.restore({
    id: created.id,
  })) as {
    deletedAt: Date | string | null;
  };
  assert(restored.deletedAt === null, "User restore did not clear deletedAt.");
  pass("user.restore reactivates the soft-deleted user");

  await caller.user.delete({ id: created.id });

  const storedUser = await db.user.findUnique({
    where: { id: created.id },
    select: {
      role: true,
      phoneNumber: true,
      deletedAt: true,
    },
  });
  assert(storedUser, "Created user could not be reloaded from the database.");
  assert(storedUser.role === Role.MANAGER, "Final stored role does not match the update.");
  assert(storedUser.phoneNumber === updatedPhone, "Final stored phone number does not match the update.");
  assert(storedUser.deletedAt, "Final cleanup delete did not leave the record soft-deleted.");
  pass("database state matches the user management mutations");

  console.log("User and role management smoke test completed successfully.");
}

main()
  .catch((error) => {
    console.error("Smoke test failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
