const express= require("express");
const path= require("path");
const fs= require("fs");

app= express();
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

const obGlobal = {
    obErori: null
};
const vect_foldere = ["temp", "logs", "backup", "fisiere_uploadate"];

for (const numeFolder of vect_foldere) {
    const caleFolder = path.join(__dirname, numeFolder);
    if (!fs.existsSync(caleFolder)) {
        fs.mkdirSync(caleFolder);
    }
}

function detecteazaCheiDuplicate(jsonText) {
    const duplicate = [];
    const stiva = [];
    let inString = false;
    let escapeActiv = false;
    let buffer = "";
    let ultimulString = null;

    for (let i = 0; i < jsonText.length; i++) {
        const caracter = jsonText[i];

        if (inString) {
            if (escapeActiv) {
                buffer += caracter;
                escapeActiv = false;
                continue;
            }

            if (caracter === "\\") {
                escapeActiv = true;
                continue;
            }

            if (caracter === "\"") {
                inString = false;
                ultimulString = buffer;
                buffer = "";
                continue;
            }

            buffer += caracter;
            continue;
        }

        if (/\s/.test(caracter)) {
            continue;
        }

        if (caracter === "\"") {
            inString = true;
            buffer = "";
            continue;
        }

        if (caracter === "{") {
            stiva.push({
                tip: "object",
                chei: new Map(),
                asteaptaCheie: true
            });
            continue;
        }

        if (caracter === "}") {
            stiva.pop();
            ultimulString = null;
            continue;
        }

        if (caracter === "[") {
            stiva.push({ tip: "array" });
            continue;
        }

        if (caracter === "]") {
            stiva.pop();
            ultimulString = null;
            continue;
        }

        const context = stiva[stiva.length - 1];

        if (caracter === ":" && context?.tip === "object" && context.asteaptaCheie && ultimulString !== null) {
            const aparitii = context.chei.get(ultimulString) || 0;
            context.chei.set(ultimulString, aparitii + 1);

            if (aparitii >= 1) {
                duplicate.push({
                    cheie: ultimulString,
                    index: i
                });
            }

            context.asteaptaCheie = false;
            ultimulString = null;
            continue;
        }

        if (caracter === "," && context?.tip === "object") {
            context.asteaptaCheie = true;
            ultimulString = null;
            continue;
        }

        if (caracter === "," && context?.tip === "array") {
            ultimulString = null;
            continue;
        }
    }

    return duplicate;
}

function valideazaErori(obErori, jsonText, caleJson) {
    const duplicate = detecteazaCheiDuplicate(jsonText);
    for (const info of duplicate) {
        console.error(
            `[erori.json] Proprietatea "${info.cheie}" este definită de mai multe ori într-un obiect din JSON (aprox. la poziția ${info.index}). Elimină proprietatea duplicată pentru ca fișierul să rămână valid și ușor de întreținut.`
        );
    }

    const proprietatiTopLevel = ["info_erori", "cale_baza", "eroare_default"];
    for (const proprietate of proprietatiTopLevel) {
        if (!(proprietate in obErori)) {
            console.error(
                `[erori.json] Lipsește proprietatea obligatorie "${proprietate}". Fișierul trebuie să conțină info_erori, cale_baza și eroare_default.`
            );
        }
    }

    if (!obErori.eroare_default || typeof obErori.eroare_default !== "object") {
        console.error(
            `[erori.json] Proprietatea "eroare_default" lipsește sau nu este un obiect valid.`
        );
    } else {
        for (const proprietate of ["titlu", "text", "imagine"]) {
            if (!(proprietate in obErori.eroare_default)) {
                console.error(
                    `[erori.json] În obiectul "eroare_default" lipsește proprietatea obligatorie "${proprietate}".`
                );
            }
        }
    }

    const caleBazaRelativa = typeof obErori.cale_baza === "string"
        ? obErori.cale_baza.replace(/^[/\\]+/, "")
        : null;
    const caleBazaAbsoluta = caleBazaRelativa
        ? path.join(__dirname, caleBazaRelativa)
        : null;

    if (!caleBazaAbsoluta || !fs.existsSync(caleBazaAbsoluta) || !fs.statSync(caleBazaAbsoluta).isDirectory()) {
        console.error(
            `[erori.json] Folderul specificat în "cale_baza" nu există în sistemul de fișiere. Verifică valoarea "${obErori.cale_baza}" și creează folderul necesar.`
        );
    }

    if (obErori.eroare_default?.imagine && caleBazaAbsoluta) {
        const caleImagineDefault = path.join(caleBazaAbsoluta, obErori.eroare_default.imagine);
        if (!fs.existsSync(caleImagineDefault)) {
            console.error(
                `[erori.json] Imaginea pentru eroarea implicită nu există: "${caleImagineDefault}". Adaugă fișierul sau corectează numele imaginii din eroare_default.imagine.`
            );
        }
    }

    if (Array.isArray(obErori.info_erori)) {
        const identificatori = new Map();

        for (const eroare of obErori.info_erori) {
            if (eroare?.imagine && caleBazaAbsoluta) {
                const caleImagine = path.join(caleBazaAbsoluta, eroare.imagine);
                if (!fs.existsSync(caleImagine)) {
                    console.error(
                        `[erori.json] Imaginea asociată erorii cu identificatorul ${eroare.identificator} nu există: "${caleImagine}". Fiecare eroare trebuie să aibă o imagine validă în folderul din "cale_baza".`
                    );
                }
            }

            if (!identificatori.has(eroare.identificator)) {
                identificatori.set(eroare.identificator, []);
            }
            identificatori.get(eroare.identificator).push(eroare);
        }

        for (const [identificator, erori] of identificatori) {
            if (erori.length > 1) {
                const descrieri = erori.map(eroare => {
                    const { identificator: _, ...rest } = eroare;
                    return JSON.stringify(rest);
                });
                console.error(
                    `[erori.json] Există mai multe erori cu același identificator (${identificator}). Obiectele conflictuale sunt: ${descrieri.join(" | ")}. Fiecare eroare trebuie să aibă identificator unic.`
                );
            }
        }
    } else {
        console.error(
            `[erori.json] Proprietatea "info_erori" lipsește sau nu este un vector valid.`
        );
    }

    return caleBazaAbsoluta;
}

function initErori() {
    const caleJson = path.join(__dirname, "erori.json");

    if (!fs.existsSync(caleJson)) {
        console.error(
            `[erori.json] Fișierul "${caleJson}" nu există. Aplicația nu poate porni fără configurarea erorilor. Creează fișierul erori.json și repornește serverul.`
        );
        process.exit(1);
    }

    const continut = fs.readFileSync(caleJson, "utf8");
    obGlobal.obErori = JSON.parse(continut);
    const caleBazaAbsoluta = valideazaErori(obGlobal.obErori, continut, caleJson);

    if (!caleBazaAbsoluta) {
        return;
    }

    obGlobal.obErori.eroare_default.imagine = path.join(
        caleBazaAbsoluta,
        obGlobal.obErori.eroare_default.imagine
    );

    for (const eroare of obGlobal.obErori.info_erori) {
        eroare.imagine = path.join(caleBazaAbsoluta, eroare.imagine);
    }
}

initErori();

function getInfoEroare(identificator) {
    const info = obGlobal.obErori.info_erori.find(
        eroare => eroare.identificator === identificator
    );

    if (info) {
        return info;
    }

    return {
        ...obGlobal.obErori.eroare_default,
        identificator: 500,
        status: true
    };
}

function afisareEroare(res, identificator, titlu, text, imagine) {
    let infoEroare;

    if (identificator) {
        const eroareGasita = obGlobal.obErori.info_erori.find(
            eroare => eroare.identificator === identificator
        );

        infoEroare = eroareGasita
            ? { ...eroareGasita }
            : {
                ...obGlobal.obErori.eroare_default,
                identificator: 500,
                status: true
            };
    } else {
        infoEroare = {
            ...obGlobal.obErori.eroare_default,
            identificator: 500,
            status: true
        };
    }

    if (titlu) {
        infoEroare.titlu = titlu;
    }
    if (text) {
        infoEroare.text = text;
    }
    if (imagine) {
        infoEroare.imagine = path.isAbsolute(imagine)
            ? imagine
            : path.join(__dirname, imagine.replace(/^\/+/, ""));
    }

    const infoEroareRender = {
        ...infoEroare,
        imagine: `/${path.relative(__dirname, infoEroare.imagine).replace(/\\/g, "/")}`
    };
    const statusCode = infoEroare.status ? infoEroare.identificator : 200;

    res.status(statusCode).render("pagini/eroare", {
        eroare: infoEroareRender
    });
}

console.log("Folder index.js", __dirname);
console.log("Folder curent (de lucru)", process.cwd());
console.log("Cale fisier", __filename);

app.get(/^\/resurse(\/.*)?$/, function(req, res, next){
    const caleCeruta = path.join(__dirname, req.path);

    if (fs.existsSync(caleCeruta) && fs.statSync(caleCeruta).isDirectory()) {
        afisareEroare(res, 403);
        return;
    }

    next();
});

app.get(/\.ejs$/, function(req, res){
    afisareEroare(res, 400);
});

app.get("/favicon.ico", function(req, res){
    res.sendFile(path.join(__dirname, "resurse", "favicon", "favicon.ico"));
});

app.use("/resurse",express.static(path.join(__dirname,"resurse")));

app.get(["/", "/index", "/home"],function(req,res){
    const ipUtilizator = req.ip.startsWith("::ffff:")
        ? req.ip.replace("::ffff:", "")
        : req.ip;

    res.render("pagini/index", {
        ipUtilizator
    });
});

app.get("/colectii",function(req,res){
    res.render("pagini/colectii");
});

app.get("/branduri",function(req,res){
    res.render("pagini/branduri");
});

app.get("/contact",function(req,res){
    res.render("pagini/contact");
});

app.get("/cale",function(req,res){
    console.log("Am primit o cerere GET pe /cale");
    res.send("Raspuns la cererea GET pe /cale");
});

app.get("/cale2",function(req,res){
    res.write("Raspuns la cererea GET pe /cale2");
    res.write("altceva");
    res.end();
});

app.get("/:pagina",function(req,res){
    const pagina = req.params.pagina;
    res.render(`pagini/${pagina}`, function(eroare, rezultatRandare){
        if (eroare) {
            if (eroare.message.startsWith("Failed to lookup view")) {
                afisareEroare(res, 404);
            } else {
                console.error(eroare);
                afisareEroare(res, 500);
            }
        } else {
            res.send(rezultatRandare);
        }
    });
});

app.listen(8080);
console.log("Serverul a pornit!");
