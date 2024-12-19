
'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Booking extends Model {

    static associate(models) {
      Booking.belongsTo(models.User, {
        foreignKey: 'userId'
      });

      Booking.belongsTo(models.Spot, {
        foreignKey: 'spotId'
      })
    }
  }
  Booking.init({
    spotId: DataTypes.INTEGER,
    userId: DataTypes.INTEGER,
    startDate: {
      type: DataTypes.DATE,
      allowNull: false,
      validate: {
        isAfter: DataTypes.NOW,
      }
    },
    endDate: {
      type: DataTypes.DATE,
      allowNull: false,
      validate: {
        afterStart(value) {
          if (value <= this.startDate) {
            throw Error ('End date must be after start date.')
          }
        }
      }
    },
  }, {
    sequelize,
    modelName: 'Booking',
  });
  return Booking;
};
