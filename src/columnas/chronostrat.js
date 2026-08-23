'use strict';

window.CHRONOSTRAT_DATA = {
  eons: [
    {
      name: 'Fanerozoico', rgb: [163, 217, 235],
      eras: [
        {
          name: 'Cenozoico', rgb: [252, 234, 13],
          periodos: [
            {
              name: 'Cuaternario', rgb: [255, 244, 154],
              epocas: [
                { name: 'Holoceno', rgb: [255, 234, 210], edades: [
                  { name: 'Megalayiano', rgb: [252, 237, 236] },
                  { name: 'Norgripiano', rgb: [253, 236, 227] },
                  { name: 'Groenlandiano', rgb: [253, 235, 219] },
                ]},
                { name: 'Pleistoceno', rgb: [255, 239, 174], edades: [
                  { name: 'Superior', rgb: [255, 244, 224] },
                  { name: 'Chibaniano', rgb: [255, 243, 215] },
                  { name: 'Calabriano', rgb: [255, 242, 205] },
                  { name: 'Gelasiano', rgb: [255, 241, 195] },
                ]},
              ]
            },
            {
              name: 'Neógeno', rgb: [255, 222, 15],
              epocas: [
                { name: 'Plioceno', rgb: [255, 246, 177], edades: [
                  { name: 'Piacenziano', rgb: [255, 250, 209] },
                  { name: 'Zancliano', rgb: [255, 249, 199] },
                ]},
                { name: 'Mioceno', rgb: [255, 236, 0], edades: [
                  { name: 'Mesiniano', rgb: [255, 244, 142] },
                  { name: 'Tortoniano', rgb: [255, 243, 129] },
                  { name: 'Serravaliano', rgb: [255, 242, 115] },
                  { name: 'Langhiano', rgb: [255, 241, 100] },
                  { name: 'Burdigaliano', rgb: [255, 240, 85] },
                  { name: 'Aquitaniano', rgb: [255, 239, 67] },
                ]},
              ]
            },
            {
              name: 'Paleógeno', rgb: [245, 173, 109],
              epocas: [
                { name: 'Oligoceno', rgb: [250, 203, 150], edades: [
                  { name: 'Chattiano', rgb: [255, 232, 192] },
                  { name: 'Rupeliano', rgb: [253, 223, 177] },
                ]},
                { name: 'Eoceno', rgb: [249, 193, 137], edades: [
                  { name: 'Priaboniano', rgb: [251, 215, 183] },
                  { name: 'Bartoniano', rgb: [250, 205, 169] },
                  { name: 'Lutetiano', rgb: [248, 195, 156] },
                  { name: 'Ypresiano', rgb: [247, 185, 142] },
                ]},
                { name: 'Paleoceno', rgb: [247, 183, 123], edades: [
                  { name: 'Thanetiano', rgb: [251, 202, 140] },
                  { name: 'Selandiano', rgb: [251, 201, 130] },
                  { name: 'Daniano', rgb: [249, 192, 126] },
                ]},
              ]
            },
          ]
        },
        {
          name: 'Mesozoico', rgb: [98, 195, 221],
          periodos: [
            {
              name: 'Cretácico', rgb: [148, 194, 95],
              epocas: [
                { name: 'Superior', rgb: [187, 208, 93], edades: [
                  { name: 'Maastrichtiano', rgb: [249, 241, 166] },
                  { name: 'Campaniano', rgb: [239, 236, 154] },
                  { name: 'Santoniano', rgb: [229, 231, 143] },
                  { name: 'Coniaciano', rgb: [219, 225, 129] },
                  { name: 'Turoniano', rgb: [209, 220, 117] },
                  { name: 'Cenomaniano', rgb: [198, 214, 105] },
                ]},
                { name: 'Inferior', rgb: [161, 200, 109], edades: [
                  { name: 'Albiano', rgb: [217, 229, 175] },
                  { name: 'Aptiano', rgb: [206, 224, 164] },
                  { name: 'Barremiano', rgb: [196, 218, 152] },
                  { name: 'Hauteriviano', rgb: [184, 212, 141] },
                  { name: 'Valanginiano', rgb: [173, 206, 129] },
                  { name: 'Berriasiano', rgb: [160, 200, 118] },
                ]},
              ]
            },
            {
              name: 'Jurásico', rgb: [0, 175, 222],
              epocas: [
                { name: 'Superior', rgb: [188, 228, 246], edades: [
                  { name: 'Titoniano', rgb: [223, 241, 252] },
                  { name: 'Kimmeridgiano', rgb: [212, 237, 249] },
                  { name: 'Oxfordiano', rgb: [200, 232, 248] },
                ]},
                { name: 'Medio', rgb: [133, 206, 232], edades: [
                  { name: 'Calloviano', rgb: [201, 231, 239] },
                  { name: 'Bathoniano', rgb: [189, 227, 238] },
                  { name: 'Bajociano', rgb: [176, 222, 237] },
                  { name: 'Aaleniano', rgb: [163, 217, 235] },
                ]},
                { name: 'Inferior', rgb: [0, 180, 224], edades: [
                  { name: 'Toarciano', rgb: [163, 211, 238] },
                  { name: 'Pliensbachiano', rgb: [133, 201, 235] },
                  { name: 'Sinemuriano', rgb: [97, 191, 232] },
                  { name: 'Hettangiano', rgb: [39, 180, 229] },
                ]},
              ]
            },
            {
              name: 'Triásico', rgb: [146, 75, 147],
              epocas: [
                { name: 'Superior', rgb: [197, 166, 203], edades: [
                  { name: 'Rhaetiano', rgb: [229, 204, 224] },
                  { name: 'Noriano', rgb: [218, 191, 217] },
                  { name: 'Carniano', rgb: [208, 179, 210] },
                ]},
                { name: 'Medio', rgb: [186, 134, 182], edades: [
                  { name: 'Ladiniano', rgb: [206, 159, 197] },
                  { name: 'Anisiano', rgb: [196, 147, 189] },
                ]},
                { name: 'Inferior', rgb: [166, 88, 154], edades: [
                  { name: 'Olenekiano', rgb: [185, 113, 167] },
                  { name: 'Induano', rgb: [175, 100, 160] },
                ]},
              ]
            },
          ]
        },
        {
          name: 'Paleozoico', rgb: [169, 197, 165],
          periodos: [
            {
              name: 'Pérmico', rgb: [225, 93, 64],
              epocas: [
                { name: 'Lopingiano', rgb: [246, 187, 169], edades: [
                  { name: 'Changhsingiano', rgb: [249, 207, 196] },
                  { name: 'Wuchiapingiano', rgb: [248, 197, 183] },
                ]},
                { name: 'Guadalupiano', rgb: [240, 142, 116], edades: [
                  { name: 'Capitaniano', rgb: [245, 176, 155] },
                  { name: 'Wordiano', rgb: [243, 165, 142] },
                  { name: 'Roadiano', rgb: [241, 154, 129] },
                ]},
                { name: 'Cisuraliano', rgb: [228, 117, 92], edades: [
                  { name: 'Kunguriano', rgb: [226, 160, 141] },
                  { name: 'Artinskiano', rgb: [225, 149, 129] },
                  { name: 'Sakmariano', rgb: [223, 138, 116] },
                  { name: 'Asseliano', rgb: [222, 127, 104] },
                ]},
              ]
            },
            {
              name: 'Carbonífero', rgb: [111, 174, 176],
              epocas: [
                { name: 'Pensilvaniano', rgb: [131, 191, 199], edades: [
                  { name: 'Gzheliano', rgb: [213, 219, 214] },
                  { name: 'Kasimoviano', rgb: [201, 215, 213] },
                  { name: 'Moscoviano', rgb: [191, 210, 204] },
                  { name: 'Bashkiriano', rgb: [166, 201, 201] },
                ]},
                { name: 'Misisipiano', rgb: [119, 157, 126], edades: [
                  { name: 'Serpukhoviano', rgb: [205, 200, 134] },
                  { name: 'Viseano', rgb: [183, 192, 133] },
                  { name: 'Tournaisiano', rgb: [159, 183, 132] },
                ]},
              ]
            },
            {
              name: 'Devónico', rgb: [211, 159, 80],
              epocas: [
                { name: 'Superior', rgb: [245, 228, 180], edades: [
                  { name: 'Famenniano', rgb: [245, 239, 213] },
                  { name: 'Frasniano', rgb: [246, 237, 195] },
                ]},
                { name: 'Medio', rgb: [243, 207, 131], edades: [
                  { name: 'Givetiano', rgb: [246, 225, 160] },
                  { name: 'Eifeliano', rgb: [245, 216, 146] },
                ]},
                { name: 'Inferior', rgb: [232, 184, 104], edades: [
                  { name: 'Emsiano', rgb: [235, 213, 145] },
                  { name: 'Pragiano', rgb: [234, 203, 131] },
                  { name: 'Lochkoviano', rgb: [233, 194, 118] },
                ]},
              ]
            },
            {
              name: 'Silúrico', rgb: [192, 223, 203],
              epocas: [
                { name: 'Pridoliano', rgb: [235, 244, 235], edades: [] },
                { name: 'Ludloviano', rgb: [203, 230, 222], edades: [
                  { name: 'Ludfordiano', rgb: [225, 240, 234] },
                  { name: 'Gorstiano', rgb: [214, 235, 232] },
                ]},
                { name: 'Wenlockiano', rgb: [191, 224, 212], edades: [
                  { name: 'Homeriano', rgb: [214, 234, 223] },
                  { name: 'Sheinwoodiano', rgb: [203, 229, 213] },
                ]},
                { name: 'Llandoveriano', rgb: [167, 213, 201], edades: [
                  { name: 'Telychiano', rgb: [203, 230, 222] },
                  { name: 'Aeroniano', rgb: [191, 224, 212] },
                  { name: 'Rhuddaniano', rgb: [180, 218, 202] },
                ]},
              ]
            },
            {
              name: 'Ordovícico', rgb: [0, 149, 125],
              epocas: [
                { name: 'Superior', rgb: [141, 200, 170], edades: [
                  { name: 'Hirnantiano', rgb: [180, 217, 192] },
                  { name: 'Katiano', rgb: [168, 211, 182] },
                  { name: 'Sandbiano', rgb: [156, 205, 171] },
                ]},
                { name: 'Medio', rgb: [70, 178, 147], edades: [
                  { name: 'Darriwiliano', rgb: [124, 196, 179] },
                  { name: 'Dapingiano', rgb: [108, 190, 168] },
                ]},
                { name: 'Inferior', rgb: [0, 158, 126], edades: [
                  { name: 'Floiano', rgb: [30, 174, 156] },
                  { name: 'Tremadociano', rgb: [0, 168, 146] },
                ]},
              ]
            },
            {
              name: 'Cámbrico', rgb: [147, 171, 110],
              epocas: [
                { name: 'Furongiano', rgb: [194, 220, 175], edades: [
                  { name: 'Piso 10', rgb: [236, 242, 217] },
                  { name: 'Jiangshaniano', rgb: [226, 237, 206] },
                  { name: 'Paibiano', rgb: [217, 230, 185] },
                ]},
                { name: 'Miaolingiano', rgb: [183, 208, 159], edades: [
                  { name: 'Guzhangiano', rgb: [215, 224, 192] },
                  { name: 'Drumiano', rgb: [205, 219, 181] },
                  { name: 'Wuliuano', rgb: [194, 213, 170] },
                ]},
                { name: 'Serie 2', rgb: [171, 195, 146], edades: [
                  { name: 'Piso 4', rgb: [193, 206, 167] },
                  { name: 'Piso 3', rgb: [182, 201, 156] },
                ]},
                { name: 'Terreneuviano', rgb: [159, 183, 132], edades: [
                  { name: 'Piso 2', rgb: [182, 194, 153] },
                  { name: 'Fortuniano', rgb: [171, 188, 143] },
                ]},
              ]
            },
          ]
        },
      ]
    },
    {
      name: 'Precámbrico', rgb: [233, 96, 123],
      eras: [
        {
          name: 'Proterozoico', rgb: [231, 82, 112],
          periodos: [
            {
              name: 'Neoproterozoico', rgb: [249, 190, 92],
              epocas: [
                { name: 'Ediacariano', rgb: [254, 219, 134], edades: [] },
                { name: 'Criogeniano', rgb: [253, 210, 120], edades: [] },
                { name: 'Toniano', rgb: [251, 200, 106], edades: [] },
              ]
            },
            {
              name: 'Mesoproterozoico', rgb: [249, 192, 126],
              epocas: [
                { name: 'Steniano', rgb: [253, 223, 177], edades: [] },
                { name: 'Ectasiano', rgb: [252, 213, 163], edades: [] },
                { name: 'Calymmiano', rgb: [250, 203, 150], edades: [] },
              ]
            },
            {
              name: 'Paleoproterozoico', rgb: [233, 96, 123],
              epocas: [
                { name: 'Statheriano', rgb: [239, 146, 173], edades: [] },
                { name: 'Orosiriano', rgb: [237, 134, 160], edades: [] },
                { name: 'Rhyaciano', rgb: [236, 121, 147], edades: [] },
                { name: 'Sideriano', rgb: [234, 109, 135], edades: [] },
              ]
            },
          ]
        },
        {
          name: 'Arqueano', rgb: [226, 0, 121],
          periodos: [
            { name: 'Neoarqueano', rgb: [244, 180, 200], epocas: [] },
            { name: 'Mesoarqueano', rgb: [237, 135, 172], epocas: [] },
            { name: 'Paleoarqueano', rgb: [232, 96, 155], epocas: [] },
            { name: 'Eoarqueano', rgb: [211, 0, 122], epocas: [] },
          ]
        },
        {
          name: 'Hadeano', rgb: [181, 0, 123],
          periodos: []
        },
      ]
    },
  ]
};

// Lookup helpers
CHRONOSTRAT_DATA.findEon = function(n) {
  return this.eons.find(e => e.name === n) || null;
};
CHRONOSTRAT_DATA.findEra = function(eon, era) {
  return this.findEon(eon)?.eras.find(e => e.name === era) || null;
};
CHRONOSTRAT_DATA.findPeriodo = function(eon, era, per) {
  return this.findEra(eon, era)?.periodos.find(p => p.name === per) || null;
};
CHRONOSTRAT_DATA.findEpoca = function(eon, era, per, ep) {
  return this.findPeriodo(eon, era, per)?.epocas.find(e => e.name === ep) || null;
};
CHRONOSTRAT_DATA.findEdad = function(eon, era, per, ep, ed) {
  return this.findEpoca(eon, era, per, ep)?.edades.find(e => e.name === ed) || null;
};

// Given a period name, resolve the full hierarchy (for backward compat)
CHRONOSTRAT_DATA.resolveFromPeriod = function(periodName) {
  for (const eon of this.eons) {
    for (const era of eon.eras) {
      for (const per of era.periodos) {
        if (per.name === periodName) {
          return { eon: eon.name, era: era.name, period: per.name };
        }
      }
    }
  }
  return null;
};
