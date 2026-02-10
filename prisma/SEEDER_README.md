# Database Seeder

This seeder creates test users and departments for the Travel & Claim System.

## Quick Start

```bash
# Install dependencies (if not already installed)
npm install

# Run the seeder
npm run db:seed
```

## Created Test Users

All test users have the same password: **`password123`**

### User Accounts by Role

| Role | Email | Employee ID | Department |
|------|-------|-------------|------------|
| ADMIN | admin@company.com | EMP001 | IT |
| FINANCE | finance@company.com | EMP002 | Finance |
| DIRECTOR | director@company.com | EMP003 | Sales |
| MANAGER | manager@company.com | EMP004 | Sales |
| SUPERVISOR | supervisor@company.com | EMP005 | Sales |
| EMPLOYEE | employee1@company.com | EMP006 | Sales |
| EMPLOYEE | employee2@company.com | EMP007 | IT |
| EMPLOYEE | employee3@company.com | EMP008 | HR |

## Organizational Hierarchy

```
Director (director@company.com)
  └── Manager (manager@company.com)
      └── Supervisor (supervisor@company.com)
          ├── Employee 1 (employee1@company.com)
          ├── Employee 2 (employee2@company.com)
          └── Employee 3 (employee3@company.com)
```

## Created Departments

- **SALES** - Sales Department
- **IT** - IT Department
- **FINANCE** - Finance Department
- **HR** - Human Resources

## Login Instructions

1. Go to http://localhost:3000/login
2. Use any of the email addresses above
3. Enter password: `password123`
4. Click "Sign in with Email"

## Features

- **Upsert Logic**: Running the seeder multiple times won't create duplicates
- **Hashed Passwords**: All passwords are securely hashed with bcrypt
- **Proper Hierarchy**: Users are linked with supervisor relationships
- **Department Assignment**: Each user is assigned to a department
- **Phone Numbers**: All users have WhatsApp-ready phone numbers

## Running After Database Reset

```bash
# Reset database and run migrations
npm run db:push

# Seed the database
npm run db:seed
```

## Customization

To modify the seeder, edit `prisma/seed.ts`:
- Add more users
- Change default password
- Modify departments
- Adjust hierarchy

## Notes

- The seeder uses `upsert` operations, so it's safe to run multiple times
- All users have `emailVerified` set to allow immediate login
- Phone numbers follow Indonesian format (+628...)