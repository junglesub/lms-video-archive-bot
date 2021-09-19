const fs = require("fs");

const DATAFILENAME = "data.json";
let fdata = {};

// Load Data
if (fs.existsSync(DATAFILENAME)) {
  const rawdata = fs.readFileSync(DATAFILENAME);
  fdata = JSON.parse(rawdata);
} else {
  fdata = {};
}

// Use Data
console.log(fdata);
fdata[new Date().toString()] = 1;

// Save Data
fs.writeFileSync(DATAFILENAME, JSON.stringify(fdata));
