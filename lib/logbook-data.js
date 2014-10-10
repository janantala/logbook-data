var Q = require('q');
var _ = require('lodash');
var logbookTrip = require('./logbook-trip');
var logbookCar = require('./logbook-car');
var logbookDiet = require('./logbook-diet');

var getRandomArbitrary = function(min, max) {
  return Math.random() * (max - min) + min;
};

var toFixed = function(value, decimals){
  var exponent = 1;
  while (decimals > 0){
    exponent *= 10;
    decimals--;
  }

  return Math.round(value * exponent) / exponent;
};

var CONFIG = {
  'car': {
    'fuelType': 'diesel',
    'fuelEconomy': 5.5
  },
  'trip': {
    'origin': 'Bánovce nad Bebravou',
    'destination': 'Bratislava',
    'maxTripStartBefore': 5,
    'maxTripReturnAfter': 20,
    'minTripDuration': 13,
    'startTime': 7,
    'minWayDurationMultiplier': 1.1,
    'maxWayDurationMultiplier': 1.2
  }
};

/*
{
  'origin' - string - address
  'destination' - string - address
  'duration': int - in hours
  'max-trip-start-before': int - in minutes
  'max-trip-return-after': int - in minutes
  'start': int - start hour
}
*/

var calculateTravelData = function(carConfiguration, tripConfiguration, trips, cb) {

  CONFIG.car = _.extend(CONFIG.car, carConfiguration);
  CONFIG.trip = _.extend(CONFIG.trip, tripConfiguration);
  
  console.log('\n================================\n');

  console.log('CONFIG');
  console.log(CONFIG);

  console.log('\n================================\n');

  var the_promises = [];

  trips.forEach(function(trip){
    
    var fromDeferred = Q.defer();
    var returnDeferred = Q.defer();

    the_promises.push(fromDeferred.promise);
    the_promises.push(returnDeferred.promise);

    logbookTrip.getTrip((trip.origin || CONFIG.trip.origin), (trip.destination || CONFIG.trip.destination), function(err, trip){
      if (err) {
        fromDeferred.reject(err);
      }
      else {
        fromDeferred.resolve(trip);
      }
    });

    logbookTrip.getTrip((trip.destination || CONFIG.trip.destination), (trip.origin || CONFIG.trip.origin), function(err, trip){
      if (err) {
        returnDeferred.reject(err);
      }
      else {
        returnDeferred.resolve(trip);
      }
    });
  });

  var outputs = [];
  var count = 0;
  Q.all(the_promises)

  // calculate distance and duration
  .then(function(results) {
    console.log('Calculating distances and durations...');
    results.forEach(function (trip) {
      var WAY_DURATION_MULTIPLIER = getRandomArbitrary(CONFIG.trip.minWayDurationMultiplier, CONFIG.trip.maxWayDurationMultiplier);

      var myTrip = {
        'from': (trip.origin || CONFIG.trip.origin),
        'to': (trip.destination || CONFIG.trip.destination),
        'distance': Math.ceil(trip.distance / 1000),
        'duration': Math.ceil(trip.duration * WAY_DURATION_MULTIPLIER / 60)
      };

      if (count % 2 === 0) {
        var sourceTrip = trips[count / 2];
        outputs.push({
          'date': new Date(sourceTrip['date'])
        });
      }

      if (count % 2 === 0) {
        var sourceTrip = trips[count / 2];

        var startTime = new Date(outputs[outputs.length - 1]['date']);
        startTime.setHours((sourceTrip['start'] || CONFIG.trip.startTime));
        startTime.setMinutes(startTime.getMinutes() - getRandomArbitrary(0, (sourceTrip['max-trip-start-before'] || CONFIG.trip.maxTripStartBefore)));
        myTrip.startTime = startTime;

        var endTime = new Date(startTime);
        endTime.setMinutes(endTime.getMinutes() + myTrip.duration);
        myTrip.endTime = endTime;

        outputs[outputs.length - 1]['from'] = myTrip;
      }
      else {
        // return

        var sourceTrip = trips[(count - 1) / 2];

        var tripStartTime = outputs[outputs.length - 1]['from']['startTime'];
        var endTime = new Date(tripStartTime);
        endTime.setHours(tripStartTime.getHours() + (sourceTrip['duration'] || CONFIG.trip.minTripDuration));
        endTime.setMinutes(endTime.getMinutes() + getRandomArbitrary(0, (sourceTrip['max-trip-return-after'] || CONFIG.trip.maxTripReturnAfter)));
        myTrip.endTime = endTime;

        var startTime = new Date(endTime);
        startTime.setMinutes(startTime.getMinutes() - myTrip.duration);
        myTrip.startTime = startTime;

        outputs[outputs.length - 1]['return'] = myTrip;

        var duration = outputs[outputs.length - 1]['return']['endTime'] - outputs[outputs.length - 1]['from']['startTime'];
        var distance = outputs[outputs.length - 1]['return']['distance'] + outputs[outputs.length - 1]['from']['distance'];
        outputs[outputs.length - 1]['totalDistance'] = distance;
        outputs[outputs.length - 1]['totalDuration'] = duration / 1000 / 60;
        outputs[outputs.length - 1]['startTime'] = outputs[outputs.length - 1]['from']['startTime'];
        outputs[outputs.length - 1]['endTime'] = outputs[outputs.length - 1]['return']['endTime'];
      }

      count++;
    });

    return outputs;
  })

  // calculate refunds
  .then(function(trips){
    console.log('Calculating refunds...');
    trips.forEach(function(trip){
      var refunds = {};
      refunds['fuelRefund'] = toFixed(logbookCar.getFuelRefund(CONFIG.car, trip.totalDistance, trip.date), 2);
      refunds['privateCarRefund'] = toFixed(logbookCar.getPrivateCarRefund(trip.totalDistance), 2);
      refunds['dietAllowance'] = toFixed(logbookDiet.getDietAllowance(trip.totalDuration), 2);
      refunds['total'] = toFixed(refunds['privateCarRefund'] + refunds['fuelRefund'] + refunds['dietAllowance'], 2);
      trip['refunds'] = refunds;
    });
    return trips;
  })

  // final
  .then(function(trips){
    console.dir(trips);
    
    console.log('\n================================\n');

    var refunds = {
      fuelRefund: 0,
      privateCarRefund: 0,
      dietAllowance: 0,
      total: 0
    };

    trips.forEach(function(trip){
      console.log(new Date(trip.date).toLocaleDateString(), ':', toFixed(trip.refunds.total, 2));
      refunds.fuelRefund = toFixed(refunds.fuelRefund + trip.refunds.fuelRefund, 2);
      refunds.privateCarRefund = toFixed(refunds.privateCarRefund + trip.refunds.privateCarRefund, 2);
      refunds.dietAllowance = toFixed(refunds.dietAllowance + trip.refunds.dietAllowance, 2);
      refunds.total = toFixed(refunds.total + trip.refunds.total, 2);
    });

    console.log('\n================================\n');
    console.log('Total:\n', refunds);

    console.log('\n================================\n');

    var response = {};
    response.trips = trips;
    response.refunds = refunds;
    return response;
  })

  // response
  .then(function(response){
    return cb(null, response);
  })

  .fail(function (err) {
    return cb(err);
  });

};

module.exports = {
  calculateTravelData: calculateTravelData
};
