const { Waiter, getLocalClient, Tenant } = require("../waiters/libsql") 




const client = getLocalClient("/Users/blaze/Development/experiments/waiter-js/db/test.db")
const userSchema = {
    "id": {
        type: "INTEGER", 
        constraints: [["PRIMARY KEY"]]
    },
    "username": { 
        type: "VARCHAR",
        constraints: [["UNIQUE"], ["NOT NULL"]]
    }
}


/**@type {import("../waiters/libsql").WaiterSchema} */
const productSchema = { 
    "id": { 
        type: "INTEGER",
        constraints: [["PRIMARY KEY"]]
    },
    "name": {
        type: "VARCHAR",
        constraints: [["UNIQUE"],["NOT NULL"]]
    },
    "price": { 
        type: "DOUBLE",
        constraints: [["DEFAULT",0.0]]
    },
    "description": { 
        type: "TEXT",
        constraints: []
    }
}


const productsWaiter = Waiter(client, "Products", productSchema)
const usersWaiter = Waiter(client, "Users", userSchema)



/**
 * the different tenant tables that each tenant should have 
 * @typedef {Object} AppTenant
 * @property {Tenant} Products
 * @property {Tenant} Users
 */

//use defined waiters to get/initialize tenants for each provided tenant name 
async function createTenanats(...names){
    /**
     * @type {{[name:string]: AppTenant}
     */
    const Tenants = {}
    for(const name of names){
        const t = {Products:null, Users:null}
        //attempt to create/get product tenant table
        const resProducts = await productsWaiter.getTenant(name)
        if(resProducts.error){
            console.error(`[createTenant] Failed to create tenant ${name} on Products...\nReason`, error)
            continue
        } else { 
            //set the AppTenant's Products table
            t.Products = resProducts
        }
        

        //attempt to create/get user tenant table
        const resUsers = await usersWaiter.getTenant(name)
        if(resUsers.error){
            console.error(`[createTenant] Failed to create tenant ${name} on Products...\nReason`, error)
            continue
        } else { 
            //set the AppTentant's Users table
            t.Users = resUsers
        }

        //skip any tenants that failed to initialize all tables
        if(t.Products == null || t.Users === null) continue;

        //store tenant in map
        Tenants[name] = t
    }
    //respond with map of tenants
    return Tenants
}



async function main(){
    const Tenants = await createTenanats("a","b","c");
    console.log(`Successfully initialized ${Object.keys(Tenants).length} tenants!`);
   
    // insert data
    const {data:insertedProduct,error:insertProductsErr } = await Tenants['a'].Products.create({name: "Magic Conch Shell", price: 420.69, description: "The one and only magic conch shell; can determine your fate..."});
    if(insertProductsErr) {
        console.error("Failed to insert product...\nReason", insertProductsErr);
        return;
    }

    const  {data:insertedUser, error:insertedUserErr } = await Tenants["a"].Users.create({
        username: "Hugh Janus", 
    });
    if(insertedUserErr){
        console.error("Failed to insert user to tenant table...\nReason: ", insertedUserErr);
        return; 
    }

    console.log("Inserted Product", insertedProduct);
    console.log('Inserted User: ', insertedUser);



    const productsA = await Tenants['a'].Products.get();
    const usersA = await Tenants['a'].Users.get();
    console.log('== All Products A ==\n',productsA);
    console.log('== All Users A ==\n',usersA);
    
}

main()