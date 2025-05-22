const express = require("express")
const router = express.Router()
const db = require("./db")

// -- RESOLVER SQL INJECTION -- 

const isLojista = async (user_id, client_connection) => {
    const rows = await client_connection.query(`SELECT * FROM transfers."lojista" lj WHERE lj.user_id = ${user_id}`)

    if (rows.rowCount == 0) {
        return false
    }

    return true
}

const hasSaldo = async (user_id, transfer_value, client_connection) => {
    const rows = await client_connection.query(`
        SELECT * FROM transfers."usuario" us
        INNER JOIN transfers."carteira" ct ON us.carteira = ct.id
        WHERE us.id = ${user_id}
    `)

    const saldo = rows.rows[0].saldo
    
    if (saldo < transfer_value) {
        return false
    }

    return true
}

const authorizeTransfer = async (payer, payee, value) => {
    try {
        const response = await fetch(process.env.AUTH_URL)
        if (response.ok) {
            return false
        }
        return true
    } catch (e) {
        // -- MELHORAR O TRATAMENTO DE ERROS AQUI --
        return false
    }
}

const makeTransfer = async (payer, payee, value, client_connection) => {
    try{
        console.log(`                        
UPDATE transfers."carteira" c
SET saldo = saldo - ${value}
FROM transfers."usuario" u
WHERE c.id = u.carteira
  AND u.id = ${payer};
        `)
        await client_connection.query(`
                        UPDATE transfers."carteira" c
SET saldo = saldo - $1
FROM transfers."usuario" u
WHERE c.id = u.carteira
  AND u.id = $2;
        `, [value, payer])

        return true
    } catch (e) {
        console.log(e)
        return false
    }
}

router.route("/transfer")
    .post(async (req, res) => {
        const transfer = req.body
        const client_connection = await db.connectDatabase()
        
        if (await isLojista(transfer.payer, client_connection)) {
            return res.status(400).json({"success": false, "message": "Usuários lojistas não podem fazer transferências!"}) 
        }

        if (!(await hasSaldo(transfer.payer, transfer.value, client_connection))) {
            return res.status(400).json({"success": false, "message": "Saldo insuficiente!"}) 
        }

        if (!(await authorizeTransfer(transfer.payer, transfer.payee, transfer.value))) {
            return res.status(400).json({"success": false, "message": "Transferência não autorizada!"})
        }

        makeTransfer(transfer.payer, transfer.payee, transfer.value)

        // -- TERMINAR A LÓGICA DA TRANSFERÊNCIA --

        return res.status(200).json({"success": true, "message": "Transferência realizada!"})
    })
    .all((req, res) => {
        return res.status(405).json({"success": false, "message": "Método não autorizado!"})
    })

module.exports = router