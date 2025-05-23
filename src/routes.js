const express = require("express")
const router = express.Router()
const db = require("./db")

// -- RESOLVER SQL INJECTION -- 

const isLojista = async (user_id, client_connection) => {
    const rows = await client_connection.query(`
        SELECT * FROM transfers."lojista" lj 
        WHERE lj.user_id = $1`
    , [user_id])

    if (rows.rowCount == 0) {
        return false
    }

    return true
}

const hasSaldo = async (user_id, transfer_value, client_connection) => {
    const rows = await client_connection.query(`
        SELECT * FROM transfers."usuario" us
        INNER JOIN transfers."carteira" ct ON us.carteira = ct.id
        WHERE us.id = $1
    `, [user_id])

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

const getUserBalance = async (user, client_connection) => {
    const userBalanceResponse = await client_connection.query(`                        
            SELECT u.id, saldo FROM transfers."usuario" u 
            INNER JOIN transfers."carteira" c ON c.id = u.carteira
            WHERE u.id = $1
        `, [user])
    
    return parseInt(userBalanceResponse.rows[0].saldo)
}

const makeTransfer = async (payer, payee, value, client_connection) => {
    const oldPayerBalance = await getUserBalance(payer, client_connection)
    const oldPayeeBalance = await getUserBalance(payee, client_connection)

    try{
        await client_connection.query(`                        
            UPDATE transfers."carteira" c
            SET saldo = saldo - $1
            FROM transfers."usuario" u
            WHERE c.id = u.carteira
            AND u.id = $2
        `, [value, payer])

        await client_connection.query(`                        
            UPDATE transfers."carteira" c
            SET saldo = saldo + $1
            FROM transfers."usuario" u
            WHERE c.id = u.carteira
            AND u.id = $2
        `, [value, payee])
    } catch (error) {
        const newPayerBalance = await getUserBalance(payer, client_connection)
        const newPayeeBalance = await getUserBalance(payee, client_connection)

        if (oldPayerBalance !== newPayerBalance) {
            await client_connection.query(`                        
                UPDATE transfers."carteira" c
                SET saldo = saldo + $1
                FROM transfers."usuario" u
                WHERE c.id = u.carteira
                AND u.id = $2
            `, [value, payer])
        }

        if (oldPayeeBalance !== newPayeeBalance) {
            await client_connection.query(`                        
                UPDATE transfers."carteira" c
                SET saldo = saldo - $1
                FROM transfers."usuario" u
                WHERE c.id = u.carteira
                AND u.id = $2
            `, [value, payee])
        }
        throw new Error("Tranferência não realizada!")
    }
}

router.route("/transfer")
    .post(async (req, res) => {
        const transfer = req.body
        const client_connection = await db.connectDatabase()
        const value = transfer.value * 100
        const payerID = transfer.payer
        const payeeID = transfer.payee

        if (payerID === payeeID) {
            return res.status(400).json({"success": false, "message": "Não é possível fazer uma transferência para si mesmo!"}) 
        }
        
        if (await isLojista(payerID, client_connection)) {
            return res.status(400).json({"success": false, "message": "Usuários lojistas não podem fazer transferências!"}) 
        }

        if (!(await hasSaldo(payerID, value, client_connection))) {
            return res.status(400).json({"success": false, "message": "Saldo insuficiente!"}) 
        }

        if (!(await authorizeTransfer(payerID, payeeID, value))) {
            return res.status(400).json({"success": false, "message": "Transferência não autorizada!"})
        }

        try {
            makeTransfer(payerID, payeeID, value, client_connection)
        } catch (e) {
            return res.status(400).json({"success": false, "message": "Transferência não realizada!"})
        }

        return res.status(200).json({"success": true, "message": "Transferência realizada!"})
    })
    .all((req, res) => {
        return res.status(405).json({"success": false, "message": "Método não autorizado!"})
    })

module.exports = router