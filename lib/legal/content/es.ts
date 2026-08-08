// Legal pages — Castellano.
//
// A translation of the English draft in ./en.ts, and just as much a DRAFT:
// it carries no independent legal review. Any change to the English text must
// be reflected here in the same change.

import type { LegalContent } from "../types";

export const es: LegalContent = {
  privacy: {
    title: "Política de privacidad",
    updated: "Última actualización: 5 de agosto de 2026",
    draftNotice:
      "Borrador pendiente de revisión legal: hay que completar la identidad del responsable del tratamiento y la dirección de contacto que aparecen más abajo antes de que este despliegue acepte usuarios distintos de su operador.",
    sections: [
      {
        title: "Quién es responsable de tus datos",
        paragraphs: [
          {
            text: "Estalvify está operada por [responsable del tratamiento — nombre y dirección]. Para cualquier solicitud sobre privacidad, escribe a [correo de contacto].",
          },
        ],
      },
      {
        title: "Qué recogemos y por qué",
        paragraphs: [
          {
            term: "Datos de la cuenta",
            text: "tu nombre, tu dirección de correo y tu foto de perfil, que recibimos de Google cuando inicias sesión. Base jurídica: ejecución de un contrato (el funcionamiento de tu cuenta).",
          },
          {
            term: "Datos bancarios",
            text: "cuando conectas un banco recibimos la lista de tus cuentas, los saldos diarios y los movimientos (importes, fechas, descripciones y referencias de pago) a través de Enable Banking, un proveedor PSD2 autorizado, bajo el consentimiento expreso que das a tu banco. Minimizamos deliberadamente lo que guardamos: nunca almacenamos el IBAN completo, solo los cuatro últimos dígitos.",
          },
          {
            term: "Datos que creas tú",
            text: "categorías, reglas de categorización, presupuestos, elementos planificados, series recurrentes y preferencias.",
          },
          {
            text: "No vendemos tus datos, no los usamos con fines publicitarios ni elaboramos perfiles más allá de las funciones que ves en la app.",
          },
        ],
      },
      {
        title: "Quién los trata por nosotros",
        listIntro:
          "Tus datos los tratan los siguientes encargados, con contratos de encargo de tratamiento:",
        list: [
          { term: "Vercel", text: "alojamiento de la aplicación y registros." },
          {
            term: "Neon",
            text: "base de datos, alojada en la UE (AWS eu-central-1, Fráncfort).",
          },
          {
            term: "Enable Banking",
            text: "conectividad bancaria PSD2 (el proveedor externo autorizado al que das el consentimiento bancario).",
          },
          { term: "Google", text: "solo el inicio de sesión." },
          {
            term: "Anthropic",
            text: "análisis con IA, opcional. Solo se envían agregados anonimizados y nombres de categorías; nunca números de cuenta, descripciones de movimientos ni nombres de comercios.",
          },
        ],
      },
      {
        title: "Cuánto tiempo los conservamos",
        paragraphs: [
          {
            text: "Tus datos se conservan mientras exista tu cuenta. Las sesiones caducadas, los códigos y tokens de autorización caducados y las notificaciones de más de 90 días (leídas) o de más de un año (sin leer) se eliminan automáticamente. Cuando eliminas tu cuenta, todos tus datos se borran de inmediato; las copias residuales en registros de infraestructura y en copias de seguridad de la base de datos caducan según los plazos de los proveedores (semanas, no años).",
          },
        ],
      },
      {
        title: "Tus derechos",
        paragraphs: [
          {
            text: "Según el RGPD puedes acceder a tus datos, rectificarlos, portarlos, limitar su tratamiento, oponerte a él y suprimirlos. Dos de estos derechos son autoservicio en Ajustes → Privacidad y datos:",
          },
        ],
        list: [
          {
            term: "Exportar",
            text: "descargar todo en un archivo JSON (portabilidad).",
          },
          {
            term: "Eliminar la cuenta",
            text: "borra todos tus datos y revoca los consentimientos bancarios en Enable Banking.",
          },
        ],
      },
      {
        title: "Dónde reclamar",
        paragraphs: [
          {
            text: "Para cualquier otra cosa, contacta con el responsable indicado arriba. También puedes presentar una reclamación ante tu autoridad de control (en España, la AEPD).",
          },
        ],
      },
      {
        title: "Seguridad",
        paragraphs: [
          {
            text: "Todo el tráfico va cifrado en tránsito (TLS) y nuestro proveedor de base de datos cifra los datos en reposo. La conectividad bancaria usa peticiones firmadas a Enable Banking; nunca vemos ni guardamos tus credenciales bancarias. Para acceder a la aplicación hace falta iniciar sesión con Google, y el acceso por API usa tokens de vida corta y revocables que apruebas expresamente en una pantalla de consentimiento.",
          },
        ],
      },
    ],
    footer: {
      text: "Consulta también los {link}.",
      linkLabel: "Términos del servicio",
      href: "/terms",
    },
  },

  terms: {
    title: "Términos del servicio",
    updated: "Última actualización: 5 de agosto de 2026",
    draftNotice:
      "Borrador pendiente de revisión legal: hay que completar la identidad del operador que aparece más abajo antes de que este despliegue acepte usuarios distintos de su operador.",
    sections: [
      {
        title: "El servicio",
        paragraphs: [
          {
            text: "Estalvify es una herramienta de finanzas personales operada por [operador — nombre y dirección]. Te permite conectar tus cuentas bancarias a través de Enable Banking (un proveedor PSD2 autorizado), ver y categorizar tus movimientos y planificar tu tesorería. Al crear una cuenta aceptas estos términos y la Política de privacidad.",
          },
        ],
      },
      {
        title: "Tu cuenta",
        paragraphs: [
          {
            text: "Inicias sesión con una cuenta de Google y eres responsable de mantenerla segura. Solo puedes conectar cuentas bancarias a las que estés autorizado a acceder. Puedes eliminar tu cuenta cuando quieras desde Ajustes: la eliminación es inmediata e irreversible.",
          },
        ],
      },
      {
        title: "Conexiones bancarias",
        paragraphs: [
          {
            text: "El acceso bancario se produce bajo PSD2 con tu consentimiento expreso, que das a tu banco a través de Enable Banking. Los consentimientos caducan como máximo a los 90 días y se pueden retirar en cualquier momento: en tu banco, desconectando el banco aquí o eliminando tu cuenta. Nunca vemos ni guardamos tus credenciales bancarias, y la conexión es de solo lectura: desde Estalvify no se puede iniciar ningún pago.",
          },
        ],
      },
      {
        title: "Lo que Estalvify no es",
        paragraphs: [
          {
            text: "Estalvify ofrece información y herramientas de planificación, no asesoramiento financiero. Las cifras se derivan de lo que informa tu banco y pueden estar incompletas o llegar con retraso; comprueba con tu banco cualquier dato importante. Los análisis generados con IA son sugerencias, no recomendaciones de un asesor cualificado.",
          },
        ],
      },
      {
        title: "Uso aceptable",
        paragraphs: [
          {
            text: "No intentes acceder a los datos de otras personas usuarias, sondear o saturar el servicio, ni usarlo para nada ilícito. Podemos suspender las cuentas que lo hagan.",
          },
        ],
      },
      {
        title: "Responsabilidad",
        paragraphs: [
          {
            text: "El servicio se presta «tal cual». En la medida en que lo permita la ley, el operador no responde de los daños indirectos ni de las decisiones tomadas a partir de la información mostrada. Nada en estos términos limita la responsabilidad que no puede limitarse legalmente.",
          },
        ],
      },
      {
        title: "Cambios",
        paragraphs: [
          {
            text: "Estos términos pueden cambiar; los cambios sustanciales se anunciarán en la app antes de que entren en vigor. Si sigues usando el servicio después, aceptas los nuevos términos.",
          },
        ],
      },
    ],
    footer: {
      text: "Consulta también la {link}.",
      linkLabel: "Política de privacidad",
      href: "/privacy",
    },
  },
};
