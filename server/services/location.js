const axios = require('axios');
const logger = require('../helpers/logger');

const LOCATION_KEY = process.env.LOCATION_KEY ? process.env.LOCATION_KEY : require('../../local').LOCATION_KEY;

async function getLocationAddress(req, res, next) {
    try {
        const { lat, lon } = req.query;
        const response = await axios.get(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lon}&key=${LOCATION_KEY}&language=he&region=IL`);
        logger.info('response', response)
        const address = response.body.results[0].formatted_address;
        return res.status(200).send({ address });
    } catch (e) {
        next(e);
    }
}

module.exports = {
    getLocationAddress,
}
