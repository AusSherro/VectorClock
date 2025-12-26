/**
 * ICAO Type Code to Friendly Names
 * Shared between server.js and app.js (browser)
 * 
 * This file is used in both Node.js (server) and browser (via script tag).
 */

const ICAO_TYPE_NAMES = {
    // Boeing
    'B788': 'Boeing 787-8 Dreamliner',
    'B789': 'Boeing 787-9 Dreamliner',
    'B78X': 'Boeing 787-10 Dreamliner',
    'B737': 'Boeing 737',
    'B738': 'Boeing 737-800',
    'B739': 'Boeing 737-900',
    'B38M': 'Boeing 737 MAX 8',
    'B39M': 'Boeing 737 MAX 9',
    'B772': 'Boeing 777-200',
    'B773': 'Boeing 777-300',
    'B77W': 'Boeing 777-300ER',
    'B77L': 'Boeing 777-200LR',
    'B744': 'Boeing 747-400',
    'B748': 'Boeing 747-8',

    // Airbus
    'A319': 'Airbus A319',
    'A320': 'Airbus A320',
    'A20N': 'Airbus A320neo',
    'A321': 'Airbus A321',
    'A21N': 'Airbus A321neo',
    'A332': 'Airbus A330-200',
    'A333': 'Airbus A330-300',
    'A339': 'Airbus A330-900neo',
    'A359': 'Airbus A350-900',
    'A35K': 'Airbus A350-1000',
    'A388': 'Airbus A380-800',

    // Regional
    'E190': 'Embraer E190',
    'E195': 'Embraer E195',
    'E170': 'Embraer E170',
    'E290': 'Embraer E190-E2',
    'DH8D': 'Dash 8 Q400',
    'DH8C': 'Dash 8 Q300',
    'DH8B': 'Dash 8 Q200',
    'AT76': 'ATR 72-600',
    'AT75': 'ATR 72-500',
    'SF34': 'Saab 340',
    'F100': 'Fokker 100',
    'CRJ7': 'CRJ-700',
    'CRJ9': 'CRJ-900',

    // Business/Private
    'GLF6': 'Gulfstream G650',
    'GL7T': 'Gulfstream G700',
    'GLEX': 'Bombardier Global Express',
    'G280': 'Gulfstream G280',
    'CL35': 'Bombardier Challenger 350',
    'C680': 'Cessna Citation Sovereign',
    'PC12': 'Pilatus PC-12',
    'PC24': 'Pilatus PC-24',
    'C172': 'Cessna 172',
    'C208': 'Cessna Caravan',
    'BE20': 'Beechcraft King Air',
    'PA28': 'Piper Cherokee',
    'C510': 'Cessna Citation Mustang',
    'C525': 'Cessna Citation CJ',
    'C560': 'Cessna Citation V',
    'C750': 'Cessna Citation X',

    // Helicopters
    'EC35': 'Airbus EC135',
    'EC45': 'Airbus EC145',
    'EC55': 'Airbus EC155',
    'AS50': 'Airbus AS350 Squirrel',
    'B06': 'Bell 206',
    'B412': 'Bell 412',

    // Military
    'C17': 'Boeing C-17 Globemaster III',
    'C130': 'Lockheed C-130 Hercules',
    'C30J': 'Lockheed C-130J Super Hercules',
    'E737': 'Boeing E-7A Wedgetail',
    'P8': 'Boeing P-8A Poseidon',
    'PC21': 'Pilatus PC-21',
    'HAWK': 'BAE Hawk',
    'F35': 'F-35 Lightning II',
    'FA18': 'F/A-18 Hornet',
    'F18S': 'F/A-18F Super Hornet',
    'KC30': 'KC-30A MRTT',
    'C5': 'C-5M Galaxy',
    'B52': 'B-52 Stratofortress',
    'KC10': 'KC-10 Extender',
    'KC35': 'KC-135 Stratotanker',

    // Classics/Unusual
    'A343': 'Airbus A340-300',
    'A345': 'Airbus A340-500',
    'A346': 'Airbus A340-600',
    'MD11': 'McDonnell Douglas MD-11',
    'DC10': 'McDonnell Douglas DC-10',
    'L101': 'Lockheed L-1011',
    'CONC': 'Concorde',
    'A124': 'Antonov An-124',
    'AN12': 'Antonov An-12',

    // Special
    'A3ST': 'Airbus Beluga',
    'BLCF': 'Boeing Dreamlifter'
};

// Helper function to resolve aircraft names with fallbacks
function getAircraftName(typeCode) {
    if (!typeCode) return 'Unknown Aircraft';

    // Direct match
    if (ICAO_TYPE_NAMES[typeCode]) return ICAO_TYPE_NAMES[typeCode];

    // Prefix matching for Boeing/Airbus generic
    if (typeCode.startsWith('B78')) return 'Boeing 787 Dreamliner';
    if (typeCode.startsWith('B77')) return 'Boeing 777';
    if (typeCode.startsWith('B74')) return 'Boeing 747';
    if (typeCode.startsWith('A38')) return 'Airbus A380';
    if (typeCode.startsWith('A35')) return 'Airbus A350';
    if (typeCode.startsWith('A34')) return 'Airbus A340';
    if (typeCode.startsWith('A33')) return 'Airbus A330';
    if (typeCode.startsWith('C130')) return 'C-130 Hercules';

    return typeCode; // Fallback to code
}

// Export for Node.js (server.js)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ICAO_TYPE_NAMES, getAircraftName };
}
