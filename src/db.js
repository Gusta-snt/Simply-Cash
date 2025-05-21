const { Pool } = require("pg")

const connectDatabase = async () => {
    const pool = new Pool({
        connectionString: process.env.DB_CONN_STRING
    })

    const client = await pool.connect()

    const res = await client.query("SELECT NOW()")
    client.release()

    return pool.connect()
}

module.exports = {connectDatabase}