const moment = require('moment');
const logger = require('../helpers/logger');
const { getSpecificRestaurant } = require('./search');
const { sendHtmlMail } = require('../helpers/email');
const { subscriptions, users, Sequelize: { Op }, } = require('../models');
const INTERVAL = 30000;
const PRON_INTERVAL = 1000 * 60 * 10;
const AMOUNT = 30;
const UNITS = 'hours';

async function isOpenForDelivery(restaurantName, restaurantId, location) {
   const restaurant = await getSpecificRestaurant(restaurantName, restaurantId, location)
   if (!restaurant) {
       return false;
   }
   return restaurant.isOpen;
}
const EMAIL_USER = process.env.EMAIL_USER ? process.env.EMAIL_USER : require('../../local').EMAIL_USER;

async function checkUserSubscription(subscription) {
    logger.info(`checkUserSubscription: ${JSON.stringify(subscription)}`);

    const {restaurantName, restaurantId, lat,lon, email, id} = subscription;
    const isOpen = await isOpenForDelivery(restaurantName, restaurantId, { lat, lon });
    if (isOpen) {
        sendHtmlMail(`Restaurant ${restaurantName} is now open for deliveries`, `<div><div><b>Restaurant ${restaurantName} is now open for deliveries</b><br/></div><div>you have automatically unsubscribe for this Restaurant.</div></div>`, email)
        sendHtmlMail(`Restaurant ${restaurantName} is now open for deliveries`, `<div>the user who asked for this was: <b>{email}</b></div>`, EMAIL_USER)
        await subscriptions.destroy({where: { id }});
    }
}


async function getUserSubscriptions(email) {
    let userSubscriptions;
    if (email === EMAIL_USER) {
        userSubscriptions = await subscriptions.findAll();
        const users = await users.findAll();
        userSubscriptions.forEach((userSubscription) =>{
            userSubscription.subscriber = users.find(user => user.email === userSubscription.email);
            userSubscription.isAdmin = userSubscription.email === EMAIL_USER;
        })
    } else{
        userSubscriptions = await subscriptions.findAll({
            where: {
                email
            },
        });
    }
    return userSubscriptions;
}

async function subscribe(req, res) {
    const { userContext } = req;
    console.log('subscribe, userContext', userContext);
    const { email } = userContext;
    const { restaurantName, restaurantId, location, } = req.body;
    try {
      if (!restaurantName || !location || !location.lat || !location.lon || !email || !restaurantId) {
          res.status(400).send({ message: 'missing attribute', restaurantName, location, email, restaurantId });
      }

      logger.info(`subscribe restaurantName: ${restaurantName},restaurantId:${restaurantId} email=${email},  lat=${location.lat}, lon=${location.lon}`);
      const restaurant = await getSpecificRestaurant(restaurantName, restaurantId, location)
      if (!restaurant) {
          res.status(400).send({ message: 'can not find this restaurant', restaurantName, location, email, restaurantId });
      }

      if (restaurant.isOpen) {
          res.status(400).send({ message: 'restaurant already open'});
          return;
      }
      const { image: { url:restaurantImage}, venue: { address: restaurantAddress } } = restaurant;
      const existing = await subscriptions.findOne({ where:{
              restaurantId,
              email
          }})
      if (!existing) {
          await subscriptions.create({
              restaurantId,
              email,
              lat:location.lat,
              lon:location.lon,
              restaurantName,
              restaurantImage,
              restaurantAddress,
          })
      }

      const userSubscriptions = await getUserSubscriptions(email);

      return res.status(200).send({ subscriptions: userSubscriptions, userContext });
  } catch(e) {
      logger.info('subscribe ERROR');
      logger.info(`restaurantName: ${restaurantName},restaurantId:${restaurantId} email=${email},  lat=${location.lat}, lon=${location.lon}`);
      logger.error(`error stack: ${e.stack}`);
      logger.error(`error message: ${e.message}`);
      return res.status(500).send({ message: 'something went wrong' });
  }
}

async function getSubscriptions(req, res, next) {
    try {
        const { userContext } = req;
        console.log('getSubscriptions, userContext', userContext);
        const { email } = userContext;
        const userSubscriptions = await getUserSubscriptions(email);
        return res.status(200).send({ subscriptions: userSubscriptions, userContext });
    } catch(e) {
        next(e);
    }
}
async function unsubscribe(req, res, next) {
  try {
      const { userContext } = req;
      console.log('unsubscribe, userContext', userContext);
      const { email } = userContext;
      const { restaurantName, restaurantId, location } = req.body;
      if (!restaurantName || !location || !email || !restaurantId) {
          res.status(400).send({ message: 'missing attribute', restaurantName, location, email, restaurantId });
      }

      logger.info(`unsubscribe restaurantName: ${restaurantName},restaurantId:${restaurantId} email=${email},  lat=${location.lat}, lon=${location.lon}`);

      await subscriptions.destroy({
          where:{
              restaurantId,
              email,
          }
      })
      const userSubscriptions = await getUserSubscriptions(email);
      return res.status(200).send({ subscriptions: userSubscriptions, userContext });

  } catch(e) {
      next(e);
  }
}

setInterval(async()=>{

    const allSubscriptions = await subscriptions.findAll();
    logger.info(`Subscriptions: ${allSubscriptions.length}`);
    allSubscriptions.forEach(checkUserSubscription);
},INTERVAL);


//run every PRON_INTERVAL time nd delete from subscriptions table anything older then X hours
setInterval(async()=>{
    logger.info(`pronning..`);

    const lastDate = moment().subtract(AMOUNT, UNITS).toDate();
    await subscriptions.destroy({where:{
            createdAt: {
                [Op.lte]: lastDate,
            },
        }})
},PRON_INTERVAL);


module.exports = {subscribe,unsubscribe, getSubscriptions }
