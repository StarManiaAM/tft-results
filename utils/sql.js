const execute = async (db, sql) => {
    return new Promise((resolve, reject) => {
        db.exec(sql, (err) => {
            if (err) reject(err);
            resolve();
        });
    });
};

export async function init(db) {
    try {
        await execute(
            db,
            `CREATE TABLE IF NOT EXISTS users (
                                                  puuid INTEGER PRIMARY KEY,
                                                  region TEXT NOT NULL,
                                                  username TEXT NOT NULL,
                                                  tag TEXT NOT NULL)`
        );
    } catch (error) {
        console.log(error);
    } finally {
        db.close();
    }
}