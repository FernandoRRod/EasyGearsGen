function nowIso() {
  return new Date().toISOString();
}

function plusMinutesIso(minutes) {
  return new Date(Date.now() + (minutes * 60 * 1000)).toISOString();
}

module.exports = { nowIso, plusMinutesIso };
