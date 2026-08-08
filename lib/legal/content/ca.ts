// Legal pages — Català.
//
// A translation of the English draft in ./en.ts, and just as much a DRAFT:
// it carries no independent legal review. Any change to the English text must
// be reflected here in the same change.

import type { LegalContent } from "../types";

export const ca: LegalContent = {
  privacy: {
    title: "Política de privacitat",
    updated: "Última actualització: 5 d’agost de 2026",
    draftNotice:
      "Esborrany pendent de revisió legal: cal completar la identitat del responsable del tractament i l’adreça de contacte que hi ha més avall abans que aquest desplegament accepti usuaris diferents del seu operador.",
    sections: [
      {
        title: "Qui és responsable de les teves dades",
        paragraphs: [
          {
            text: "Estalvify està operada per [responsable del tractament — nom i adreça]. Per a qualsevol sol·licitud sobre privacitat, escriu a [correu de contacte].",
          },
        ],
      },
      {
        title: "Què recollim i per què",
        paragraphs: [
          {
            term: "Dades del compte",
            text: "el teu nom, la teva adreça de correu i la teva foto de perfil, que rebem de Google quan inicies la sessió. Base jurídica: execució d’un contracte (el funcionament del teu compte).",
          },
          {
            term: "Dades bancàries",
            text: "quan connectes un banc rebem la llista dels teus comptes, els saldos diaris i els moviments (imports, dates, descripcions i referències de pagament) a través d’Enable Banking, un proveïdor PSD2 autoritzat, sota el consentiment exprés que dones al teu banc. Minimitzem deliberadament el que desem: mai no emmagatzemem l’IBAN complet, només els quatre últims dígits.",
          },
          {
            term: "Dades que crees tu",
            text: "categories, regles de categorització, pressupostos, elements planificats, sèries recurrents i preferències.",
          },
          {
            text: "No venem les teves dades, no les fem servir amb finalitats publicitàries ni elaborem perfils més enllà de les funcions que veus a l’app.",
          },
        ],
      },
      {
        title: "Qui les tracta per nosaltres",
        listIntro:
          "Les teves dades les tracten els encarregats següents, amb contractes d’encàrrec de tractament:",
        list: [
          { term: "Vercel", text: "allotjament de l’aplicació i registres." },
          {
            term: "Neon",
            text: "base de dades, allotjada a la UE (AWS eu-central-1, Frankfurt).",
          },
          {
            term: "Enable Banking",
            text: "connectivitat bancària PSD2 (el proveïdor extern autoritzat a qui dones el consentiment bancari).",
          },
          { term: "Google", text: "només l’inici de sessió." },
          {
            term: "Anthropic",
            text: "anàlisi amb IA, opcional. Només s’hi envien agregats anonimitzats i noms de categories; mai números de compte, descripcions de moviments ni noms de comerços.",
          },
        ],
      },
      {
        title: "Quant de temps les conservem",
        paragraphs: [
          {
            text: "Les teves dades es conserven mentre existeixi el teu compte. Les sessions caducades, els codis i els tokens d’autorització caducats i les notificacions de més de 90 dies (llegides) o de més d’un any (sense llegir) s’eliminen automàticament. Quan elimines el teu compte, totes les teves dades s’esborren immediatament; les còpies residuals als registres d’infraestructura i a les còpies de seguretat de la base de dades caduquen segons els terminis dels proveïdors (setmanes, no anys).",
          },
        ],
      },
      {
        title: "Els teus drets",
        paragraphs: [
          {
            text: "Segons el RGPD pots accedir a les teves dades, rectificar-les, portar-les, limitar-ne el tractament, oposar-t’hi i suprimir-les. Dos d’aquests drets són d’autoservei a Configuració → Privacitat i dades:",
          },
        ],
        list: [
          {
            term: "Exportar",
            text: "descarregar-ho tot en un fitxer JSON (portabilitat).",
          },
          {
            term: "Eliminar el compte",
            text: "esborra totes les teves dades i revoca els consentiments bancaris a Enable Banking.",
          },
        ],
      },
      {
        title: "On reclamar",
        paragraphs: [
          {
            text: "Per a qualsevol altra cosa, contacta amb el responsable indicat més amunt. També pots presentar una reclamació davant la teva autoritat de control (a Espanya, l’AEPD).",
          },
        ],
      },
      {
        title: "Seguretat",
        paragraphs: [
          {
            text: "Tot el trànsit va xifrat en trànsit (TLS) i el nostre proveïdor de base de dades xifra les dades en repòs. La connectivitat bancària fa servir peticions signades a Enable Banking; mai no veiem ni desem les teves credencials bancàries. Per accedir a l’aplicació cal iniciar la sessió amb Google, i l’accés per API fa servir tokens de vida curta i revocables que aproves expressament en una pantalla de consentiment.",
          },
        ],
      },
    ],
    footer: {
      text: "Consulta també els {link}.",
      linkLabel: "Termes del servei",
      href: "/terms",
    },
  },

  terms: {
    title: "Termes del servei",
    updated: "Última actualització: 5 d’agost de 2026",
    draftNotice:
      "Esborrany pendent de revisió legal: cal completar la identitat de l’operador que hi ha més avall abans que aquest desplegament accepti usuaris diferents del seu operador.",
    sections: [
      {
        title: "El servei",
        paragraphs: [
          {
            text: "Estalvify és una eina de finances personals operada per [operador — nom i adreça]. Et permet connectar els teus comptes bancaris a través d’Enable Banking (un proveïdor PSD2 autoritzat), veure i categoritzar els teus moviments i planificar la teva tresoreria. En crear un compte acceptes aquests termes i la Política de privacitat.",
          },
        ],
      },
      {
        title: "El teu compte",
        paragraphs: [
          {
            text: "Inicies la sessió amb un compte de Google i ets responsable de mantenir-lo segur. Només pots connectar comptes bancaris als quals estiguis autoritzat a accedir. Pots eliminar el teu compte quan vulguis des de Configuració: l’eliminació és immediata i irreversible.",
          },
        ],
      },
      {
        title: "Connexions bancàries",
        paragraphs: [
          {
            text: "L’accés bancari es produeix sota PSD2 amb el teu consentiment exprés, que dones al teu banc a través d’Enable Banking. Els consentiments caduquen com a màxim al cap de 90 dies i es poden retirar en qualsevol moment: al teu banc, desconnectant el banc aquí o eliminant el teu compte. Mai no veiem ni desem les teves credencials bancàries, i la connexió és només de lectura: des d’Estalvify no es pot iniciar cap pagament.",
          },
        ],
      },
      {
        title: "El que Estalvify no és",
        paragraphs: [
          {
            text: "Estalvify ofereix informació i eines de planificació, no assessorament financer. Les xifres es deriven del que informa el teu banc i poden ser incompletes o arribar amb retard; comprova amb el teu banc qualsevol dada important. Les anàlisis generades amb IA són suggeriments, no recomanacions d’un assessor qualificat.",
          },
        ],
      },
      {
        title: "Ús acceptable",
        paragraphs: [
          {
            text: "No intentis accedir a les dades d’altres usuaris, sondejar o saturar el servei, ni fer-lo servir per a res il·lícit. Podem suspendre els comptes que ho facin.",
          },
        ],
      },
      {
        title: "Responsabilitat",
        paragraphs: [
          {
            text: "El servei es presta «tal com és». En la mesura que ho permeti la llei, l’operador no respon dels danys indirectes ni de les decisions preses a partir de la informació mostrada. Res en aquests termes no limita la responsabilitat que no es pot limitar legalment.",
          },
        ],
      },
      {
        title: "Canvis",
        paragraphs: [
          {
            text: "Aquests termes poden canviar; els canvis substancials s’anunciaran a l’app abans que entrin en vigor. Si continues fent servir el servei després, acceptes els termes nous.",
          },
        ],
      },
    ],
    footer: {
      text: "Consulta també la {link}.",
      linkLabel: "Política de privacitat",
      href: "/privacy",
    },
  },
};
