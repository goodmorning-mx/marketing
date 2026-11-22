/* Read-only illustrative data, never customer storage or publication evidence.
 * Stable Brand -> Campaign -> ContentItem -> occurrence -> PublishJob identities.
 * The campaign IANA zone owns presentation; occurrence/job instants are UTC. */
(() => {
  function freeze(value) {
    if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
  }
  const records = freeze({
  "source": "demo",
  "displayTimeZone": "America/Mexico_City",
  "brands": [
    {
      "id": "demo-goodmarketing",
      "name": "GoodMarketing"
    }
  ],
  "campaigns": [
    {
      "id": "winter-campaign",
      "brandId": "demo-goodmarketing",
      "name": "Winter Campaign",
      "status": "active",
      "startDate": "2026-11-20",
      "endDate": "2026-12-18",
      "timeZone": "America/Mexico_City",
      "detailPath": "/workspace/campaigns/winter-campaign/",
      "description": {
        "en": "A seasonal campaign focused on useful ideas, thoughtful storytelling, and a consistent brand voice.",
        "es": "Una campaña de temporada centrada en ideas útiles, narración reflexiva y una voz de marca coherente."
      },
      "lead": {
        "en": "Marketing team",
        "es": "Equipo de marketing"
      }
    }
  ],
  "contentItems": [
    {
      "id": "demo-content-first-look-leopold",
      "campaignId": "winter-campaign",
      "title": {
        "en": "First look: Leopold",
        "es": "Primer vistazo: Leopold"
      },
      "variants": [
        {
          "name": "Instagram",
          "kind": "instagram",
          "mediaType": "image",
          "src": "/workspace/assets/calendar/leopold-analog-1.jpg",
          "alt": {
            "en": "Leopold analog watch with a digital date and battery display",
            "es": "Reloj analógico Leopold con pantalla digital de fecha y batería"
          },
          "caption": {
            "en": "Introducing Leopold: an analog watch designed around the details that matter. OCT 26 · 85%.",
            "es": "Te presentamos Leopold: un reloj analógico diseñado alrededor de los detalles que importan. OCT 26 · 85%."
          }
        },
        {
          "name": "Facebook",
          "kind": "facebook",
          "mediaType": "image",
          "src": "/workspace/assets/calendar/leopold-analog-1.jpg",
          "alt": {
            "en": "Leopold analog watch with a digital date and battery display",
            "es": "Reloj analógico Leopold con pantalla digital de fecha y batería"
          },
          "caption": {
            "en": "Meet Leopold. A bold analog design with a subtle digital readout for everyday life.",
            "es": "Conoce Leopold. Un diseño analógico distintivo con una discreta lectura digital para todos los días."
          }
        }
      ]
    },
    {
      "id": "demo-content-inside-the-movement",
      "campaignId": "winter-campaign",
      "title": {
        "en": "Inside the movement",
        "es": "El movimiento por dentro"
      },
      "variants": [
        {
          "name": "Instagram",
          "kind": "instagram",
          "mediaType": "video",
          "src": "/workspace/assets/calendar/leopold-mechanics.mp4",
          "poster": "/workspace/assets/calendar/leopold-mechanics-poster.png",
          "alt": {
            "en": "Leopold watch mechanism turning in close-up",
            "es": "Mecanismo del reloj Leopold en movimiento, en primer plano"
          },
          "caption": {
            "en": "Precision in motion. Take a closer look at the mechanics behind Leopold.",
            "es": "Precisión en movimiento. Mira de cerca la mecánica detrás de Leopold."
          }
        },
        {
          "name": "Facebook",
          "kind": "facebook",
          "mediaType": "video",
          "src": "/workspace/assets/calendar/leopold-mechanics.mp4",
          "poster": "/workspace/assets/calendar/leopold-mechanics-poster.png",
          "alt": {
            "en": "Leopold watch mechanism turning in close-up",
            "es": "Mecanismo del reloj Leopold en movimiento, en primer plano"
          },
          "caption": {
            "en": "A closer look at the movement and craft behind the Leopold analog watch.",
            "es": "Un vistazo más cercano al movimiento y la elaboración del reloj analógico Leopold."
          }
        }
      ]
    },
    {
      "id": "demo-content-readability-reimagined",
      "campaignId": "winter-campaign",
      "title": {
        "en": "Readability, reimagined",
        "es": "Legibilidad renovada"
      },
      "variants": [
        {
          "name": "Instagram",
          "kind": "instagram",
          "mediaType": "image",
          "src": "/workspace/assets/calendar/leopold-analog-2.jpg",
          "alt": {
            "en": "Leopold watch face with a full set of analog hour markers",
            "es": "Esfera del reloj Leopold con marcadores analógicos para cada hora"
          },
          "caption": {
            "en": "A clearer way to read time. Leopold brings considered markers to a clean analog face.",
            "es": "Una forma más clara de leer la hora. Leopold suma marcadores bien pensados a una esfera analógica limpia."
          }
        },
        {
          "name": "Facebook",
          "kind": "facebook",
          "mediaType": "image",
          "src": "/workspace/assets/calendar/leopold-analog-2.jpg",
          "alt": {
            "en": "Leopold watch face with a full set of analog hour markers",
            "es": "Esfera del reloj Leopold con marcadores analógicos para cada hora"
          },
          "caption": {
            "en": "Designed for a quick glance and a closer look: meet the refined Leopold dial.",
            "es": "Diseñado para verse de un vistazo y apreciarse de cerca: conoce la refinada esfera Leopold."
          }
        }
      ]
    },
    {
      "id": "demo-content-gold-hour-details",
      "campaignId": "winter-campaign",
      "title": {
        "en": "Gold-hour details",
        "es": "Detalles en tono dorado"
      },
      "variants": [
        {
          "name": "Instagram",
          "kind": "instagram",
          "mediaType": "image",
          "src": "/workspace/assets/calendar/leopold-analog-3.jpg",
          "alt": {
            "en": "Leopold analog watch with gold accents around the dial",
            "es": "Reloj analógico Leopold con detalles dorados alrededor de la esfera"
          },
          "caption": {
            "en": "A little brilliance in every hour. Discover the Leopold dial with golden details.",
            "es": "Un destello en cada hora. Descubre la esfera Leopold con detalles dorados."
          }
        },
        {
          "name": "Facebook",
          "kind": "facebook",
          "mediaType": "image",
          "src": "/workspace/assets/calendar/leopold-analog-3.jpg",
          "alt": {
            "en": "Leopold analog watch with gold accents around the dial",
            "es": "Reloj analógico Leopold con detalles dorados alrededor de la esfera"
          },
          "caption": {
            "en": "The finishing touch: warm gold markers meet Leopold’s signature analog design.",
            "es": "El toque final: marcadores dorados se unen al diseño analógico distintivo de Leopold."
          }
        }
      ]
    }
  ],
  "occurrences": [
    {
      "id": "demo-occurrence-first-look-leopold",
      "contentId": "demo-content-first-look-leopold",
      "scheduledAt": "2026-11-20T16:00:00.000Z",
      "status": "scheduled"
    },
    {
      "id": "demo-occurrence-inside-the-movement",
      "contentId": "demo-content-inside-the-movement",
      "scheduledAt": "2026-11-21T19:30:00.000Z",
      "status": "scheduled"
    },
    {
      "id": "demo-occurrence-readability-reimagined",
      "contentId": "demo-content-readability-reimagined",
      "scheduledAt": "2026-11-24T21:00:00.000Z",
      "status": "scheduled"
    },
    {
      "id": "demo-occurrence-gold-hour-details",
      "contentId": "demo-content-gold-hour-details",
      "scheduledAt": "2026-11-26T17:00:00.000Z",
      "status": "scheduled"
    }
  ],
  "publishJobs": [
    {
      "id": "demo-job-first-look-leopold-instagram-1",
      "contentId": "demo-content-first-look-leopold",
      "occurrenceId": "demo-occurrence-first-look-leopold",
      "platform": "instagram",
      "attempt": 1,
      "status": "published",
      "publishedAt": "2026-11-20T16:00:00.000Z"
    },
    {
      "id": "demo-job-first-look-leopold-facebook-1",
      "contentId": "demo-content-first-look-leopold",
      "occurrenceId": "demo-occurrence-first-look-leopold",
      "platform": "facebook",
      "attempt": 1,
      "status": "published",
      "publishedAt": "2026-11-20T16:00:00.000Z"
    },
    {
      "id": "demo-job-inside-the-movement-instagram-1",
      "contentId": "demo-content-inside-the-movement",
      "occurrenceId": "demo-occurrence-inside-the-movement",
      "platform": "instagram",
      "attempt": 1,
      "status": "scheduled",
      "publishedAt": null
    },
    {
      "id": "demo-job-inside-the-movement-facebook-1",
      "contentId": "demo-content-inside-the-movement",
      "occurrenceId": "demo-occurrence-inside-the-movement",
      "platform": "facebook",
      "attempt": 1,
      "status": "scheduled",
      "publishedAt": null
    },
    {
      "id": "demo-job-readability-reimagined-instagram-1",
      "contentId": "demo-content-readability-reimagined",
      "occurrenceId": "demo-occurrence-readability-reimagined",
      "platform": "instagram",
      "attempt": 1,
      "status": "scheduled",
      "publishedAt": null
    },
    {
      "id": "demo-job-readability-reimagined-facebook-1",
      "contentId": "demo-content-readability-reimagined",
      "occurrenceId": "demo-occurrence-readability-reimagined",
      "platform": "facebook",
      "attempt": 1,
      "status": "scheduled",
      "publishedAt": null
    },
    {
      "id": "demo-job-gold-hour-details-instagram-1",
      "contentId": "demo-content-gold-hour-details",
      "occurrenceId": "demo-occurrence-gold-hour-details",
      "platform": "instagram",
      "attempt": 1,
      "status": "scheduled",
      "publishedAt": null
    },
    {
      "id": "demo-job-gold-hour-details-facebook-1",
      "contentId": "demo-content-gold-hour-details",
      "occurrenceId": "demo-occurrence-gold-hour-details",
      "platform": "facebook",
      "attempt": 1,
      "status": "scheduled",
      "publishedAt": null
    }
  ],
  "milestones": [
    {
      "id": "demo-activity-leopold-campaign-milestone",
      "campaignId": "winter-campaign",
      "at": "2026-11-24T15:00:00.000Z",
      "kind": "milestone",
      "title": {
        "en": "Leopold campaign milestone",
        "es": "Hito de la campaña Leopold"
      }
    },
    {
      "id": "demo-activity-campaign-check-in",
      "campaignId": "winter-campaign",
      "at": "2026-11-30T20:00:00.000Z",
      "kind": "activity",
      "title": {
        "en": "Campaign check-in",
        "es": "Revisión de campaña"
      }
    }
  ]
});
  if (typeof module !== "undefined" && module.exports) module.exports = records;
  else window.GoodMarketingDemoCampaigns = records;
})();
