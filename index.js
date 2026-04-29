const express= require("express");
const path= require("path");
const fs= require("fs");
const sharp = require("sharp");
const sass = require("sass");

app= express();
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

const obGlobal = {
    obErori: null,
    galerie: null,
    folderScss: path.join(__dirname, "resurse", "scss"),
    folderCss: path.join(__dirname, "resurse", "css")
};
const vect_foldere = ["temp", "logs", "backup", "fisiere_uploadate"];

for (const numeFolder of vect_foldere) {
    const caleFolder = path.join(__dirname, numeFolder);
    if (!fs.existsSync(caleFolder)) {
        fs.mkdirSync(caleFolder);
    }
}

function adaugaTimestampInNumeFisier(caleFisier) {
    const extensie = path.extname(caleFisier);
    const numeFaraExtensie = path.basename(caleFisier, extensie);
    const director = path.dirname(caleFisier);

    return path.join(director, `${numeFaraExtensie}_${Date.now()}${extensie}`);
}

function compileazaScss(caleScss, caleCss) {
    const caleScssAbsoluta = path.isAbsolute(caleScss)
        ? caleScss
        : path.join(obGlobal.folderScss, caleScss);

    const extensieScss = path.extname(caleScssAbsoluta);
    const numeCssImplicit = `${path.basename(caleScssAbsoluta, extensieScss)}.css`;
    let caleCssAbsoluta;

    if (caleCss) {
        caleCssAbsoluta = path.isAbsolute(caleCss)
            ? caleCss
            : path.join(obGlobal.folderCss, caleCss);
    } else {
        caleCssAbsoluta = path.join(obGlobal.folderCss, numeCssImplicit);
    }

    const caleCssRelativa = path.relative(obGlobal.folderCss, caleCssAbsoluta);
    const caleBackupFaraTimestamp = path.join(__dirname, "backup", "resurse", "css", caleCssRelativa);
    const caleBackup = adaugaTimestampInNumeFisier(caleBackupFaraTimestamp);

    if (fs.existsSync(caleCssAbsoluta)) {
        try {
            fs.mkdirSync(path.dirname(caleBackup), { recursive: true });
            fs.copyFileSync(caleCssAbsoluta, caleBackup);
        } catch (eroare) {
            console.error(`Nu s-a putut copia backup-ul pentru ${caleCssAbsoluta}:`, eroare.message);
        }
    }

    try {
        const rezultat = sass.compile(caleScssAbsoluta, {
            style: "expanded",
            sourceMap: true
        });

        fs.mkdirSync(path.dirname(caleCssAbsoluta), { recursive: true });
        fs.writeFileSync(caleCssAbsoluta, rezultat.css);

        if (rezultat.sourceMap) {
            fs.writeFileSync(`${caleCssAbsoluta}.map`, JSON.stringify(rezultat.sourceMap));
        }

        console.log(`SCSS compilat: ${caleScssAbsoluta} -> ${caleCssAbsoluta}`);
    } catch (eroare) {
        console.error(`Eroare la compilarea SCSS pentru ${caleScssAbsoluta}:`, eroare.message);
    }
}

function compileazaToateScss() {
    if (!fs.existsSync(obGlobal.folderScss)) {
        return;
    }

    const fisiereScss = fs.readdirSync(obGlobal.folderScss)
        .filter(numeFisier => path.extname(numeFisier) === ".scss");

    for (const fisierScss of fisiereScss) {
        compileazaScss(fisierScss);
    }
}

function urmaresteFolderScss() {
    if (!fs.existsSync(obGlobal.folderScss)) {
        return;
    }

    fs.watch(obGlobal.folderScss, function(tipEveniment, numeFisier) {
        if (!numeFisier || path.extname(numeFisier) !== ".scss") {
            return;
        }

        const caleScss = path.join(obGlobal.folderScss, numeFisier);

        if (fs.existsSync(caleScss)) {
            compileazaScss(caleScss);
        }
    });
}

compileazaToateScss();
urmaresteFolderScss();

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

const dimensiuniGalerie = {
    mare: { latime: 480, inaltime: 320 },
    mediu: { latime: 320, inaltime: 214 },
    mic: { latime: 220, inaltime: 147 }
};

function minutDinOra(textOra) {
    const potrivire = /^(\d{2}):(\d{2})$/.exec(textOra);
    if (!potrivire) {
        return null;
    }

    const ore = Number(potrivire[1]);
    const minute = Number(potrivire[2]);

    if (ore < 0 || ore > 23 || minute < 0 || minute > 59) {
        return null;
    }

    return ore * 60 + minute;
}

function intervalContineOra(interval, minutCurent) {
    if (typeof interval !== "string") {
        return false;
    }

    const [inceputText, sfarsitText] = interval.split("-").map(parte => parte.trim());
    const minutInceput = minutDinOra(inceputText);
    const minutSfarsit = minutDinOra(sfarsitText);

    if (minutInceput === null || minutSfarsit === null) {
        return false;
    }

    if (minutInceput <= minutSfarsit) {
        return minutCurent >= minutInceput && minutCurent <= minutSfarsit;
    }

    return minutCurent >= minutInceput || minutCurent <= minutSfarsit;
}

function caleUrl(...segmente) {
    return "/" + path.join(...segmente).replace(/\\/g, "/");
}

async function genereazaImagineGalerie(caleSursa, caleDestinatie, dimensiune) {
    if (fs.existsSync(caleDestinatie)) {
        const infoSursa = fs.statSync(caleSursa);
        const infoDestinatie = fs.statSync(caleDestinatie);

        if (infoDestinatie.mtimeMs >= infoSursa.mtimeMs) {
            return;
        }
    }

    await fs.promises.mkdir(path.dirname(caleDestinatie), { recursive: true });
    await sharp(caleSursa)
        .resize(dimensiune.latime, dimensiune.inaltime, {
            fit: "cover",
            position: "centre"
        })
        .jpeg({ quality: 86 })
        .toFile(caleDestinatie);
}

function verificaDateGalerie(galerie, caleGalerieAbsoluta, caleJson) {
    if (typeof galerie.cale_galerie !== "string" || galerie.cale_galerie.trim() === "") {
        console.error(
            `[galerie.json] Proprietatea "cale_galerie" lipseste sau nu este un sir de caractere valid. ` +
            `Adauga in ${caleJson} o cale relativa catre folderul imaginilor, de exemplu "/resurse/imagini/galerie".`
        );
        return;
    }

    if (!fs.existsSync(caleGalerieAbsoluta)) {
        console.error(
            `[galerie.json] Folderul specificat in "cale_galerie" nu exista in sistemul de fisiere: ` +
            `"${caleGalerieAbsoluta}". Creeaza acest folder sau corecteaza valoarea "${galerie.cale_galerie}" din JSON.`
        );
        return;
    }

    if (!fs.statSync(caleGalerieAbsoluta).isDirectory()) {
        console.error(
            `[galerie.json] Valoarea din "cale_galerie" indica o cale existenta, dar nu un folder: ` +
            `"${caleGalerieAbsoluta}". Foloseste un folder care contine imaginile galeriei.`
        );
        return;
    }

    if (!Array.isArray(galerie.imagini)) {
        console.error(
            `[galerie.json] Proprietatea "imagini" lipseste sau nu este un vector. ` +
            `Adauga lista de obiecte cu proprietatea "cale_imagine" pentru fiecare imagine din galerie.`
        );
        return;
    }

    galerie.imagini.forEach((imagine, index) => {
        if (!imagine || typeof imagine.cale_imagine !== "string" || imagine.cale_imagine.trim() === "") {
            console.error(
                `[galerie.json] Imaginea de la indexul ${index} nu are proprietatea "cale_imagine" valida. ` +
                `Completeaza numele fisierului imagine, de exemplu "geanta.jpg".`
            );
            return;
        }

        const caleImagine = path.join(caleGalerieAbsoluta, imagine.cale_imagine);
        if (!fs.existsSync(caleImagine)) {
            console.error(
                `[galerie.json] Fisierul imagine specificat la indexul ${index} nu exista: ` +
                `"${caleImagine}". Verifica numele "${imagine.cale_imagine}" sau adauga fisierul in folderul galeriei.`
            );
        }
    });
}

function initGalerie() {
    const caleJson = path.join(__dirname, "galerie.json");

    if (!fs.existsSync(caleJson)) {
        console.error(`[galerie.json] Fisierul "${caleJson}" nu exista.`);
        return;
    }

    const galerie = JSON.parse(fs.readFileSync(caleJson, "utf8"));
    const caleGalerieRelativa = typeof galerie.cale_galerie === "string"
        ? galerie.cale_galerie.replace(/^[/\\]+/, "")
        : "";
    const caleGalerieAbsoluta = path.join(__dirname, caleGalerieRelativa);

    verificaDateGalerie(galerie, caleGalerieAbsoluta, caleJson);

    obGlobal.galerie = {
        ...galerie,
        cale_galerie_relativa: caleGalerieRelativa,
        cale_galerie_absoluta: caleGalerieAbsoluta
    };
}

initGalerie();

async function getGaleriePentruRender() {
    if (!obGlobal.galerie || !Array.isArray(obGlobal.galerie.imagini)) {
        return { imagini: [] };
    }

    const acum = new Date();
    const minutCurent = acum.getHours() * 60 + acum.getMinutes();
    const imaginiActive = obGlobal.galerie.imagini
        .filter(imagine => intervalContineOra(imagine.timp, minutCurent))
        .slice(0, 10);

    const imagini = [];

    for (const imagine of imaginiActive) {
        const numeExtensie = path.extname(imagine.cale_imagine);
        const numeBaza = path.basename(imagine.cale_imagine, numeExtensie);
        const caleSursa = path.join(obGlobal.galerie.cale_galerie_absoluta, imagine.cale_imagine);

        if (!fs.existsSync(caleSursa)) {
            console.error(`[galerie.json] Imagine lipsa: ${caleSursa}`);
            continue;
        }

        const caleMare = path.join(obGlobal.galerie.cale_galerie_absoluta, "mare", `${numeBaza}.jpg`);
        const caleMediu = path.join(obGlobal.galerie.cale_galerie_absoluta, "mediu", `${numeBaza}.jpg`);
        const caleMic = path.join(obGlobal.galerie.cale_galerie_absoluta, "mic", `${numeBaza}.jpg`);

        await Promise.all([
            genereazaImagineGalerie(caleSursa, caleMare, dimensiuniGalerie.mare),
            genereazaImagineGalerie(caleSursa, caleMediu, dimensiuniGalerie.mediu),
            genereazaImagineGalerie(caleSursa, caleMic, dimensiuniGalerie.mic)
        ]);

        imagini.push({
            ...imagine,
            alt: imagine.alt || imagine.titlu || imagine.cale_imagine,
            cale_mare: caleUrl(obGlobal.galerie.cale_galerie_relativa, "mare", `${numeBaza}.jpg`),
            cale_mediu: caleUrl(obGlobal.galerie.cale_galerie_relativa, "mediu", `${numeBaza}.jpg`),
            cale_mic: caleUrl(obGlobal.galerie.cale_galerie_relativa, "mic", `${numeBaza}.jpg`)
        });
    }

    return {
        cale_galerie: obGlobal.galerie.cale_galerie,
        imagini
    };
}

function numarImparAleator(minim, maxim) {
    const valori = [];
    for (let i = minim; i <= maxim; i++) {
        if (i % 2 === 1) {
            valori.push(i);
        }
    }

    return valori[Math.floor(Math.random() * valori.length)];
}

function genereazaScssGalerieAnimata(numarImagini, caleFundal) {
    const caleScss = path.join(obGlobal.folderScss, "galerie-animata.scss");
    const durataCadru = 3;
    const procentCadru = 100 / numarImagini;
    const procentPauza = procentCadru * 8 / 15;
    const procentCercMare = procentCadru * 11 / 15;
    const procentRotire = procentCadru * 13 / 15;
    const procentFinal = procentCadru;

    const continutScss = `
$nr-imagini-galerie-animata: ${numarImagini};
$durata-cadru-galerie-animata: ${durataCadru}s;
$durata-galerie-animata: $nr-imagini-galerie-animata * $durata-cadru-galerie-animata;

.galerie-animata {
    margin-top: 20px;
    background: linear-gradient(180deg, var(--fundal-crem-9) 0%, var(--fundal-crem-12) 100%);
    border-color: var(--bordura-crem-4);
}

.cadru-galerie-animata {
    position: relative;
    width: min(100%, 450px);
    height: 350px;
    margin: 2rem auto;
    overflow: hidden;
    border: 12px solid transparent;
    border-image-source: url("/resurse/imagini/chanel-classic-flap.jpg");
    border-image-slice: 30;
    border-image-repeat: round;
    background-color: var(--fundal-card);
    background-image: url("${caleFundal}");
    background-size: cover;
    background-position: center;
}

.cadru-galerie-animata figure {
    margin: 0;
    position: absolute;
    inset: 0;
    opacity: 1;
    animation-name: galerie-animata-cerc;
    animation-duration: $durata-galerie-animata;
    animation-timing-function: linear;
    animation-iteration-count: infinite;
    animation-fill-mode: both;
}

.cadru-galerie-animata img {
    width: 100%;
    height: 90%;
    object-fit: cover;
    display: block;
}

.cadru-galerie-animata figcaption {
    height: 10%;
    padding: 0 0.7rem;
    text-align: center;
    background: var(--fundal-card);
    color: var(--maro-inchis);
    font-size: 0.9rem;
    font-weight: 700;
    line-height: 35px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

@for $i from 1 through $nr-imagini-galerie-animata {
    .cadru-galerie-animata figure:nth-child(#{$i}) {
        animation-delay: ($i - 1) * $durata-cadru-galerie-animata;
        z-index: $nr-imagini-galerie-animata - $i + 1;
    }
}

.cadru-galerie-animata:hover figure {
    animation-play-state: paused;
}

@keyframes galerie-animata-cerc {
    0% {
        opacity: 1;
        clip-path: circle(150% at 50% 50%);
        transform: rotate(0deg);
    }

    ${procentPauza}% {
        opacity: 1;
        clip-path: circle(150% at 50% 50%);
        transform: rotate(0deg);
    }

    ${procentCercMare}% {
        opacity: 0.85;
        clip-path: circle(65% at 50% 50%);
        transform: rotate(0deg);
    }

    ${procentRotire}% {
        opacity: 0.65;
        clip-path: circle(40% at 50% 50%);
        transform: rotate(90deg);
    }

    ${procentFinal}% {
        opacity: 0;
        clip-path: circle(0% at 50% 50%);
        transform: rotate(180deg);
    }

    100% {
        opacity: 0;
        clip-path: circle(0% at 50% 50%);
        transform: rotate(180deg);
    }
}

@media screen and (max-width: 1100px) {
    .galerie-animata {
        display: none;
    }
}
`;

    fs.writeFileSync(caleScss, continutScss);
    compileazaScss(caleScss);
}

async function getGalerieAnimataPentruRender() {
    if (!obGlobal.galerie || !Array.isArray(obGlobal.galerie.imagini)) {
        return { imagini: [] };
    }

    const numarMaxim = Math.min(11, obGlobal.galerie.imagini.length);
    const numarImagini = numarImparAleator(5, numarMaxim);
    const imaginiSelectate = obGlobal.galerie.imagini.slice(-numarImagini);
    const imagini = [];
    const primaImagine = imaginiSelectate[0];
    const numeBazaFundal = path.basename(primaImagine.cale_imagine, path.extname(primaImagine.cale_imagine));
    const caleFundal = caleUrl(obGlobal.galerie.cale_galerie_relativa, "mare", `${numeBazaFundal}.jpg`);

    genereazaScssGalerieAnimata(numarImagini, caleFundal);

    for (const imagine of imaginiSelectate) {
        const numeExtensie = path.extname(imagine.cale_imagine);
        const numeBaza = path.basename(imagine.cale_imagine, numeExtensie);
        const caleSursa = path.join(obGlobal.galerie.cale_galerie_absoluta, imagine.cale_imagine);

        if (!fs.existsSync(caleSursa)) {
            continue;
        }

        const caleMare = path.join(obGlobal.galerie.cale_galerie_absoluta, "mare", `${numeBaza}.jpg`);
        await genereazaImagineGalerie(caleSursa, caleMare, dimensiuniGalerie.mare);

        imagini.push({
            ...imagine,
            alt: imagine.alt || imagine.titlu || imagine.cale_imagine,
            cale_mare: caleUrl(obGlobal.galerie.cale_galerie_relativa, "mare", `${numeBaza}.jpg`)
        });
    }

    return {
        numarImagini,
        imagini
    };
}

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

app.get(["/", "/index", "/home"], async function(req,res){
    const ipUtilizator = req.ip.startsWith("::ffff:")
        ? req.ip.replace("::ffff:", "")
        : req.ip;

    res.render("pagini/index", {
        ipUtilizator,
        galerie: await getGaleriePentruRender(),
        galerieAnimata: await getGalerieAnimataPentruRender()
    });
});

app.get("/galerie", async function(req,res){
    res.render("pagini/galerie", {
        galerie: await getGaleriePentruRender()
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
