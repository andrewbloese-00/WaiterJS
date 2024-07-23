const { createClient } = require("@libsql/client");
/**
 * valid column types for multitenant table columns
 * @typedef {'INTEGER' | 'FLOAT' | 'DOUBLE' | 'CHAR' | 'VARCHAR' | 'TEXT' | 'BLOB' | 'DATE' | 'TIME' | 'DATETIME' | 'BOOLEAN'} libsqlType
*/
/**
 * supported constraint types on multitenant tables using sqlite
 * @typedef {'NOT NULL' | 'UNIQUE' | 'PRIMARY KEY' | 'FOREIGN KEY' | 'CHECK' | 'DEFAULT' | 'INDEX' | 'AUTOINCREMENT'} libsqlConstraint
 */

/**
 * Describes a sqlite constraint; INDEX, FOREIGN KEY, DEFAULT, AND CHECK expect arguments as sql strings
 * @typedef {[libsqlConstraint,...any]} libsqlConstraintTuple
 */

/**
 * Describes the type and constraint(s) of a multi-tenant table column
 * @typedef {Object} WaiterSchemaEntry
 * @property {libsqlType} type - the type of the sql column
 * @property {libsqlConstraintTuple[]} constraints the constraints applied to the sql column  
 */

/**
 * Describes the column types of a multi-tenant table
 * @typedef {{ [column:string]: WaiterSchemaEntry}} WaiterSchema
 */


/**
 * @about A tenant client, linked to a particular tenant's table in the sqlite database. 
 */
class Tenant { 
    /**
     * @param {import("@libsql/client").Client} client 
     * @param { WaiterSchema } schema
     * @param {string} baseTableName
     * @param {string} tenantId
     */
    constructor(client, schema, baseTableName, tenantId ){
        this.client = client
        this.tableName = `${baseTableName}_${tenantId}`
        this._schema = schema
    }

    /**
     * 
     * @param {number} limit 
     * @param {number} offset 
     * @param {boolean} ascending 
     * @param {undefined|string} orderBy 
     * @returns 
     */
    async get(limit=10,offset=0,ascending=true, orderBy=undefined){

        console.log('Getting from tenant_table: ', this.tableName)
        let sql = `SELECT * FROM ${this.tableName}`
        try {
            if(orderBy != undefined && this._schema[orderBy] != undefined){
                sql += ` ORDER BY ${orderBy} ${ascending ? "ASC" : "DESC"}`
            }
            if(limit > 0) sql += ` LIMIT ${limit}`
            if(offset > 0) sql += ` OFFSET ${offset}`
    
            const response = await this.client.execute({sql})

            function useConverter(convert = (row,i) => row){
                try {
                    const data = response.rows.map(convert)
                    return { data }
                } catch (error) {
                    console.error("[Tenant.get().useConverter] Failed to convert row...\nError: ", error)
                    return { error }
                }
            } 

            return { data: response.rows, useConverter }
            
        } catch (error) {
            console.error(`[Tenant.get]: Failed to fetch data using query\n SQL > "${sql}\n Error: `, error)
            return { error }
        }

    }

    /**
     * @about Tries to create a new row on the tenant table
     * @param {{[column:string]: any}} properties 
     * @returns the created row || an error
     */
    async create(properties){
        try {

            const s = this._schema 
            const cols = Object.keys(s)
            let n = cols.length
            //if primary key field is not specified in result 
            const pkIdx = cols.findIndex(col=>s[col].constraints.findIndex(([cons])=> cons === "PRIMARY KEY")  >= 0 )
            const pkProperty = properties[cols[pkIdx]]
            if(!pkProperty && pkIdx >= 0){
                delete s[pkProperty];
                cols.splice(pkIdx,1)
                n--;
            }

    
            //validate properties
            const args = Array(n).fill(undefined)
            const placeholder = Array(n).fill("?").join(",")
            
            let sql = `INSERT INTO ${this.tableName} (${cols.join(",")}) VALUES (${placeholder}) RETURNING *;`
            for(let c = 0; c < n; c++){
                const property = properties[cols[c]]
                if( property != undefined ){
                    args[c] = property
                } else { 
                    if(!s[cols[c]].constraints.length) continue
                    const [_,value] = s[cols[c]].constraints.find(([cons,defaultValue])=> cons === "DEFAULT" && !!defaultValue)
                    if(value){
                        args[c] = value
                        continue
                    }
                    
                    // const hasAutoIncrement = s[cols[c]].constraints.some(([cons])=> cons === "AUTOINCREMENT")                        

                }
            }

            const [inserted] = (await this.client.execute({sql,args})).rows;
            if (!inserted) throw new Error("Unknown error occurred...")
            return { data: inserted}
            


            
        } catch (error) {
            console.error(`[Tenant.create]: Failed to insert data\nError: `, error);
            return { error };
        }



    }


}



/**
 * @about A tenant manager, 
 * @param {import("@libsql/client").Client} client
 * @param {string} tableName
 * @param {WaiterSchema} schema
 */
function Waiter(client,tableName,schema){

    /**
     * @type {{[tenantSuffix:string]:Tenant}}
     */
    const readyTenants = {};
    /**
     * @param {string} tenantSuffix 
     */
    async function getTenant(tenantSuffix){

        if(readyTenants[tenantSuffix]) return readyTenants[tenantSuffix];

        try {
            //build the schema
            const cols = [] 
            for(const colName in schema){
                const {type,constraints} = schema[colName]
                let suffix = [type]
                for(const constraintTuple of constraints){
                    const len = constraintTuple.length
                    const consType = constraintTuple[0]
                    switch(consType){
                        case "CHECK":{
                            if(len != 2) throw new Error(`expected check tuple to have length 2 but got: ${len}`)
                            const expression = constraintTuple[1];
                            suffix.push(`CHECK(${expression})`);
                            break;
                        }
                        case "INDEX": {
                            if(len != 3) throw new Error(`expected index tuple to have length 3 but got: ${len}`)
                            const [ _, idxName, idxOn ] = constraintTuple;
                            suffix.push(`INDEX ${idxName} ON ${idxOn}`);
                            break;
                        }
                        case "FOREIGN KEY":{
                            if (len != 3) throw new Error(`expected foreign key tuple to have length 3 but got: ${len}`);
                            const [ _ , foreignTable, foreignColumn_s] = constraintTuple ; 
                            suffix.push(`REFERENCE ${foreignTable}(${foreignColumn_s})`) ;
                            break;
                        }
                        case "DEFAULT": {
                            if (len != 2) throw new Error(`expected default tuple to have length 2 but got ${len}`)
                            suffix.push(`DEFAULT ${constraintTuple[1]}`);
                        }
                        case "AUTOINCREMENT": 
                            if(!["INT","FLOAT","DOUBLE"].includes(type)){
                                throw new Error("Autoincrement cannot be applied to non-numeric type column")
                            }
                            break

                        default: 
                            if (len != 1) throw new Error(`expected ${consType} tuple to have length 1 but got: ${len}`);
                            suffix.push(consType);
                    }
                }
                cols.push(`${colName} ${suffix.join(" ")}`)
            }

            const schemaSql = cols.join(",")
            await client.execute({sql: `CREATE TABLE IF NOT EXISTS ${tableName}_${tenantSuffix} (${schemaSql});`})

            //only create tenant after ensuring client has correct table
            const tenant = new Tenant(client,schema,tableName,tenantSuffix)
            readyTenants[tenantSuffix] = tenant
            return tenant
        } catch (error) {
            console.error(`Waiter for ${tableName} failed to initialize table for tenant ${tenantSuffix}\nReason:`, error); 
            return { error }
        }
    }

    function getReadyTenants(){
        return readyTenants
    }


    return { getTenant , getReadyTenants}

}


const getLocalClient = pathToFile => { 
    return createClient({
        url: `file:${pathToFile}`
    })
}

const getRemoteClient = (url, authToken) => {
    const c = createClient({url,authToken})
    try {
        return c
    } catch (error) {
        console.error("[FATAL getRemoteClient] failed to get remote client\nreason: ", error)
        process.exit(1)
    }
}


const libsqlAdapter = { Waiter , getLocalClient, Tenant}


module.exports =  libsqlAdapter

