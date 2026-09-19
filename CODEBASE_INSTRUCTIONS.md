# NestJS Backend Code Generation Skill

## Context

You are a backend code generation agent working on a **NestJS + Prisma** server. The boilerplate is already scaffolded with utilities, base classes, and abstractions. A Prisma schema is already in place — **do not modify it unless explicitly instructed**. Your job is to generate clean, consistent, production-ready module code following the conventions below exactly.

---

## Project Conventions

### 1. File & Folder Structure

**Standard module:**

```
src/modules/
  <module>/
    <module>.service.ts
    <module>.controller.ts
    <module>.module.ts
    dto/
      body.dto.ts
```

**Submodule** — only when a module has more than one feature call routed under a parent path (e.g. `/admin/products` → `products` is a submodule of `admin`):

```
src/modules/
  <module>/
    <module>.service.ts
    <module>.controller.ts
    <module>.module.ts
    modules/
      <submodule>/
        <submodule>.service.ts
        <submodule>.controller.ts
```

> **Rule:** A path like `/admin/products/:id` makes `products` a submodule of `admin`. A standalone `/products/:id` is never a submodule. Only create a submodule when there are **more than 1** feature calls — a single call stays inline.
> Even with submodule, the parent module will have controller even if no direct path is being returned. The parent controller will direct the parent path with `@Controller("module")` and submodules will add the path `@Controller("submodule")`

---

### 2. Naming Conventions

**Function names** are identical in both service and controller:

| Action     | Function Name        |
| ---------- | -------------------- |
| Create     | `createFeature`      |
| Fetch list | `fetchAllFeatures`   |
| Fetch one  | `fetchSingleFeature` |
| Update     | `updateFeature`      |
| Delete     | `deleteFeature`      |

**Parameter order:**

```ts
(id: string, subFeatureId: string, payload: Dto, user: UserPayload)
```

- `user: UserPayload` always comes **last** - Only if `user` is needed
- Don't take any parameter that is not needed for the function

---

### 3. Controller Decorators & Request Handling

- Use `@ReqField("field")` to extract specific fields from `req`
- **Never** pass `req.something` directly into a service call — always assign to a variable first:

    ```ts
    // ✗ Wrong
    fetchAllUsers(req.query);

    // ✓ Correct
    const query = req.query;
    fetchAllUsers(query);
    ```

- Use decorators wherever possible instead of manual extraction

---

### 4. Return Shapes

**Service functions** always return:

```ts
{ message: string, data?: any, pagination?: any }
```

**Controller functions** always return via `ResponseService`:

```ts
return ResponseService.formatResponse({
    statusCode: HttpStatus.OK,
    message: result.message,
    data: result.data, // optional
    pagination: result.pagination, // optional
});
```

> **Never** return `result` directly in `data`. Always destructure what you need.

---

### 5. Method-Specific Patterns

#### GET (list)

Use `QueryBuilder` for all list fetches:

```ts
const queryBuilder = new QueryBuilder<
    typeof this.prisma.model,
    Prisma.$ModelPayload
>(this.prisma.model, query);

const response = await queryBuilder
    .search(["name"])
    .sort()
    .filter({ exacts: ["type"] })
    // ...other necessary configurations
    .execute();

const pagination = await queryBuilder.countTotal();
```

If data transformation is needed, store the result in a `mapped` variable.

#### POST (create)

Spread the DTO directly — do not map fields one by one:

```ts
// ✗ Wrong
this.prisma.model.create({
    data: { name: payload.name, phone: payload.phone },
});

// ✓ Correct
this.prisma.model.create({ data: { ...payload } });
```

If certain fields need special handling (hashing, relational connects), destructure those out first:

```ts
const { password, itemId, ...restPayload } = payload;

this.prisma.model.create({
    data: {
        ...restPayload,
        password: hashedPassword(password),
        item: { connect: { id: itemId } },
    },
});
```

#### POST | PATCH | DELETE (existence checks)

Always verify record existence with a direct Prisma query — no abstracted helper functions unless the check logic is large and reused:

```ts
const user = await this.prisma.user.findUnique({ where: { id } });
if (!user) throw new ApiError(HttpStatus.NOT_FOUND, "User not found!");
```

#### POST | PATCH | DELETE (return shape)

Only return the `id` of the affected record:

```ts
return { message: "...", data: { id: response.id } };
```

---

### 6. File Uploads

- Store only the **filename** (not the full path) in the database
- Use `wrapFilename` for single file fields or already-mapped fields
- Use `walkAndTransform` for nested or array file fields
- Default file field name is `file` — only use an explicit name when context requires it (e.g. `avatar`)
- Unless explicitly said to do otherwise, follow these file settings.

---

### 7. Error Handling

```ts
throw new ApiError(HttpStatus.<STATUS_CODE>, "Descriptive error message");
```

- Always use `HttpStatus` from `@nestjs/common` for status codes
- Never use raw numeric status codes

---

### 8. Performance

- Use **parallel** Prisma/external calls wherever operations are independent:

    ```ts
    const [user, orders] = await Promise.all([
      this.prisma.user.findUnique(...),
      this.prisma.order.findMany(...),
    ]);
    ```

- For complex service functions (e.g. analytics, dashboards, summaries) that aggregate multiple independent concerns, use **two-level parallelism** — each concern is an inline `const` async function that internally parallelizes its own DB calls, and all concerns are then run concurrently at the top level:

    ```ts
    async fetchAnalytics(): Promise<...> {
      const getTotalRevenue = async () => {
        const [orders, refunds] = await Promise.all([
          this.prisma.order.aggregate({ _sum: { amount: true }, where: { status: "COMPLETED" } }),
          this.prisma.refund.aggregate({ _sum: { amount: true } }),
        ]);
        return (orders._sum.amount ?? 0) - (refunds._sum.amount ?? 0);
      };

      const getNewUsers = async () => {
        return this.prisma.user.count({ where: { createdAt: { gte: startOfMonth } } });
      };

      const getTopProducts = async () => {
        const [sales, returns] = await Promise.all([
          this.prisma.orderItem.groupBy(...),
          this.prisma.returnItem.groupBy(...),
        ]);
        // compute and return mapped result
      };

      const [totalRevenue, newUsers, topProducts] = await Promise.all([
        getTotalRevenue(),
        getNewUsers(),
        getTopProducts(),
      ]);

      return { message: "Analytics fetched", data: { totalRevenue, newUsers, topProducts } };
    }
    ```

    > Define concern functions as **inline `const` async functions** inside the service method — not as private class methods — unless they are reused across multiple service functions or is complex and large function.

---

### 9. General Rules [IMPORTANT]

- **No excessive private/helper functions** — only extract when logic is genuinely complex or reused
- **DTOs are the single source of truth** for payload shape — trust the DTO spread, do not re-validate or re-map fields manually unless needed for data insert
- **Keep controllers thin** — delegate all business logic to the service
- **Leverage Prisma** - `include`, `select`, and relational capabilities to avoid manual mapping loops wherever possible
- **Don't use `any`** - Try not to use `any` in the codebase. If you _need_ to use it, add "eslint-ignore"

---

### 10. DTO Structure

- Annotate all controller routes and DTO fields with Swagger decorators fully
- For `enum` DTO fields, always pass the enum type and list enum values in the `description`:
    ```ts
    @ApiProperty({ enum: UserRole, description: `Roles: ${Object.values(UserRole).join(", ")}` })
    role: UserRole;
    ```
- Use `class-validator` and `class-transformer` to add validations in the DTO fields:
    ```ts
    @ApiProperty({ enum: UserRole, description: `Roles: ${Object.values(UserRole).join(", ")}` })
    @IsEnum(UserRole)
    role: UserRole;

    @IsString()
    name: string;
    ```
---
