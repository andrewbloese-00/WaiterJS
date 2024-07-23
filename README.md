# Waiter - JS
Multi-tenant database management for local or remote sqlite databases (using libSQL).

****

## Scripts

`npm run example` - runs the example script without cleanup
`npm run clean` - removes the generated example db 
`example-clean` - runs the example script and cleans up afterwards
`repkg` - removes and reinstalls all node_modules
**** 
## Features
* Define schemas with column names, type, and constraints
* Use schemas to create `Waiters` who can get/initialize tables per tenant.
* Use `Tenants` to: 
    * insert data to a table
    * read data from a table
    * update / delete coming soon
    * write custom queries on a specific tenant's table
****
## Adapters
Currently the only available adapter is `libsql` which contains the follwing: 
>  **getLocalClient(pathToFile:string):libsql.Client**
Loads a libsql client using a local instance at the provided path. (path should terminate with `<filename>.db`).

>  **getRemoteClient(url:string,authToken:string):libsql.Client**
Loads a libsql client using a remote (turso) instance. url should start with `libsql://` and an `authToken` MUST be provided. halts program on failure via `exit(1)`.

> **Waiter( client:libsql.Client, tableName:string, schema:WaiterSchema )**
Generates a Waiter who can generate/get tenant tables based on a given `schema`.
Get / Create tenant table via `await waiter.getTenant("<tenant name>")`; automatically creates tenant if none existed at time of call. 
Access to initialized tenants in `waiter.

> **new Tenant(client:libsql.Client, schema:WaiterSchema, baseTableName:string, tenantId:string)**
Exposes methods to read/write contents of a tenant's table. 
****

## Converters
The result of `await Tenant.get(...)` returns a `useConverter` which allows you to pass a callback to convert each row into a Custom object if desired. The libsql rows are returned in the `data` field.

### Custom Convert Functions
Simply adhere to `(row:Row,idx:number) => any` when designing a converter where `row` is the current row data and `idx` is the index of the row in the result set.

****
## Examples
* **SQLITE/libSQL** - see `examples/sqlite_local.js` 
    * this example demonstrates how to create multiple Waiters and use their `getTenant` method to edit contents of tables using a local database (file). 
