
const express = require('express');
const { setTokenCookie, requireAuth } = require('../../utils/auth');
const { User, SpotImage, ReviewImage, Spot, Review, Booking } = require('../../db/models');
const { check, validationResult } = require('express-validator');
const { handleValidationErrors } = require('../../utils/validation');
const { Op } = require('sequelize');
const router = express.Router();



const validateFilter = [
  check("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Page must be greater than or equal to 1"),
  
  check("size")
    .optional()
    .isInt({ min: 1, max: 20 })
    .withMessage("Size must be between 1 and 20"),

  check("minLat")
    .optional()
    .isDecimal({ min: -90, max: 90 })
    .withMessage("Minimum latitude is invalid"),
  
  check("maxLat")
    .optional()
    .isDecimal({ min: -90, max: 90 })
    .withMessage("Maximum latitude is invalid"),
  
  check("minLng")
    .optional()
    .isDecimal({ min: -180, max: 180 })
    .withMessage("Minimum longitude is invalid"),
  
  check("maxLng")
    .optional()
    .isDecimal({ min: -180, max: 180 })
    .withMessage("Maximum longitude is invalid"),
  
  check("minPrice")
    .optional()
    .isDecimal({ min: 0 })
    .withMessage("Minimum price must be greater than or equal to 0"),
  
  check("maxPrice")
    .optional()
    .isDecimal({ min: 0 })
    .withMessage("Maximum price must be greater than or equal to 0"),

  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: "Bad Request",
        errors: errors.mapped(),
      });
    }
    next();
  }
];

// Return spots filtered by query parameters.
router.get('/', validateFilter, async (req, res) => {
  let { minLat, maxLat, minLng, maxLng, minPrice, maxPrice, page, size } = req.query;

  page = parseInt(page) || 1;
  size = parseInt(size) || 20;
  
  if (page < 1) page = 1;
  if (size < 1) size = 1;
  if (size > 20) size = 20;

  const where = {};

  if (minLat) minLat = parseFloat(minLat);
  if (maxLat) maxLat = parseFloat(maxLat);
  if (minLng) minLng = parseFloat(minLng);
  if (maxLng) maxLng = parseFloat(maxLng);
  if (minPrice) minPrice = parseFloat(minPrice);
  if (maxPrice) maxPrice = parseFloat(maxPrice);

  if (minLat || maxLat) {
    where.lat = {};
    if (minLat) where.lat[Op.gte] = minLat;
    if (maxLat) where.lat[Op.lte] = maxLat;
  }

  if (minLng || maxLng) {
    where.lng = {};
    if (minLng) where.lng[Op.gte] = minLng;
    if (maxLng) where.lng[Op.lte] = maxLng;
  }

  if (minPrice || maxPrice) {
    where.price = {};
    if (minPrice) where.price[Op.gte] = minPrice;
    if (maxPrice) where.price[Op.lte] = maxPrice;
  }

  try {
    const { rows: spots, count } = await Spot.findAndCountAll({
      where,
      limit: size,
      offset: (page - 1) * size,
    });

    for (let i = 0; i < spots.length; i++) {
      const spot = spots[i];

      const reviews = await Review.findAll({
        where: {
          spotId: spot.id,
        },
      });

      const reviewCount = reviews.length;
      const reviewSum = await Review.sum("stars", {
        where: { spotId: spot.id },
      });

      const avgRating = reviewCount > 0 ? reviewSum / reviewCount : null;
      spot.dataValues.avgRating = avgRating;

      const image = await SpotImage.findOne({
        attributes: ["url"],
        where: {
          spotId: spot.id,
          preview: true,
        },
      });

      spot.dataValues.previewImage = image ? image.url : null;

      spot.dataValues.lat = parseFloat(spot.lat); 
      spot.dataValues.lng = parseFloat(spot.lng); 
      spot.dataValues.price = parseInt(spot.price, 10); 
      
    }

    const totalPages = Math.ceil(count / size);

    return res.status(200).json({
      Spots: spots,
      page,
      size,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ 
        message: "Internal Server Error" 
    });
  }
});


// Get all Spots owned by the Current User
router.get('/current', requireAuth, async (req, res) => {
    const { user } = req;

    if (user) {
        const userSpots = await Spot.findAll({
            where: {
                ownerId: user.id
            },
            include: [
                {
                    model: Review
                },
                {
                    model: SpotImage,
                    where: {
                        preview: true
                    },
                    attributes: {
                        exclude: ['id', 'spotId', 'preview', 'createdAt', 'updatedAt']
                    }
                }
            ]
        })

        const allSpotsCopy = [];

        userSpots.forEach(spot => {
            let starsArr = [];
            let spotCopy = spot.toJSON();

            for (let review of spot.Reviews) {
                starsArr.push(review.stars);
            }

            if (starsArr.length) {
                const sumStars = starsArr.reduce((acc, curr) => acc + curr,);

                spotCopy.avgRating = sumStars / spot.Reviews.length;
                delete spotCopy.Reviews;
            } else {
                spotCopy.avgRating = null;
                delete spotCopy.Reviews;
            }

            spotCopy.previewImage = spot.SpotImages[0].url;
            delete spotCopy.SpotImages;

            allSpotsCopy.push(spotCopy)
        })

        res.json({ "Spots": allSpotsCopy });

    } else res.json({ user: null })
})


// Get details of a Spot from an id
router.get('/:spotId', async (req, res, next) => {
    const spotFromId = await Spot.findOne({
        where: {
            id: req.params.spotId
        },
        include: [
            {
                model: SpotImage,
            },
            User,
            {
                model: Review,
            }
        ]
    });

    if (!spotFromId) {
        return res.status(404).json({
            message: "Spot couldn't be found"
        });
    }

    const owner = await User.findOne({
        where: {
            id: spotFromId.ownerId
        },
        attributes: {
            exclude: ['username']
        }
    });

    const spotImages = await SpotImage.findAll({
        where: {
            spotId: req.params.spotId
        },
        attributes: {
            exclude: ['spotId', 'createdAt', 'updatedAt']
        }
    });

    const spotCopy = spotFromId.toJSON();

    spotCopy.numReviews = spotFromId.Reviews.length;

    let starsArr = [];

    for (let review of spotFromId.Reviews) {
        starsArr.push(review.stars);
    }

    if (starsArr.length) {
        const sumStars = starsArr.reduce((acc, curr) => acc + curr, 0);
        spotCopy.avgStarRating = sumStars / spotCopy.Reviews.length;
        delete spotCopy.Reviews;
    } else {
        spotCopy.avgStarRating = null;
        delete spotCopy.Reviews;
    }

    spotCopy.SpotImages = spotImages.map(img => ({
        id: img.id,
        url: img.url,
        preview: img.preview
    }));

    spotCopy.Owner = {
        id: owner.id,
        firstName: owner.firstName,
        lastName: owner.lastName
    };

    return res.json(spotCopy);
});


// Get all Reviews by a Spot's id
router.get('/:spotId/reviews', async (req, res, next) => {

    const spotFromId = await Spot.findByPk(req.params.spotId);

    if (!spotFromId) {
        res.status(404).json({
            "message": "Spot couldn't be found"
        })
    }

    const reviewsOfSpot = await Review.findAll({
        where: {
            spotId: req.params.spotId
        },
        include: [{
            model: User,
            attributes: {
                exclude: ['username', 'email', 'hashedPassword', 'createdAt', 'updatedAt']
            }
        },
        {
            model: ReviewImage,
            attributes: {
                exclude: ['reviewId', 'createdAt', 'updatedAt']
            }
        }]
    });
        
    return res.json({ Reviews: reviewsOfSpot });
})


// Get all of the Current User's Bookings
router.get('/:spotId/bookings', requireAuth, async (req, res, next) => {

    const { user } = req;
    const spotFromId = await Spot.findOne({
        where: {
            id: req.params.spotId
        },
    });

    if (!spotFromId) {
        return res.status(404).json({
            "message": "Spot couldn't be found"
        })
    }

    if (spotFromId.ownerId !== user.id) {
        const bookingsOfSpot = await Booking.findAll({
            where: {
                spotId: req.params.spotId
            },
            attributes: {
                exclude: ['userId', 'createdAt', 'updatedAt']
            }
        });

        return res.json({ Bookings: bookingsOfSpot });
    }

    if (spotFromId.ownerId === user.id) {
        const bookingsOfOwner = await Booking.findAll({
            where: {
                spotId: req.params.spotId
            },
            attributes: {
                include: ['id']
            }
        });


        const users = await User.findAll({
            attributes: {
                exclude: ['username', 'email', 'hashedPassword', 'createdAt', 'updatedAt']
            }
        })

        let userIds = [];
        let bookingsOfOwnerCopy = [];
        let finalCopy = [];

        for (let bookings of bookingsOfOwner) {
            userIds.push(bookings.userId)
        }

        for (let booking of bookingsOfOwner) {
            for (let bookingUser of users) {
                if (userIds.includes(bookingUser.id)) {
                    let bookingCopy = booking.toJSON();
                    let bookingUserCopy = bookingUser.toJSON();
                    bookingCopy.User = bookingUserCopy;
                    bookingsOfOwnerCopy.push(bookingCopy)
                }
            }
        }

        for (let i = 0; i < bookingsOfOwnerCopy.length; i++) {
            if (bookingsOfOwnerCopy[i].userId === bookingsOfOwnerCopy[i].User.id) {
                finalCopy.push(bookingsOfOwnerCopy[i]);
            }
        }

        return res.json({ Bookings: finalCopy })
    }
})


// Create a Review for a Spot based on the Spot's id
const validateReview = [
    check('review')
        .exists({ checkFalsy: true })
        .withMessage('Review text is required'),
    check('stars')
        .exists({ checkFalsy: true })
        .isInt({ min: 1, max: 5 })
        .withMessage("Stars must be an integer from 1 to 5"),
    handleValidationErrors
];

router.post('/:spotId/reviews', requireAuth, validateReview, async (req, res, next) => {

    const { review, stars } = req.body;
    const { user } = req;

    const spotFromId = await Spot.findByPk(req.params.spotId);

    if (!spotFromId) {
        return res.status(404).json({
            "message": "Spot couldn't be found"
        })
    }

    const spotReviews = await Review.findAll({
        where: {
            spotId: req.params.spotId,
            userId: user.id
        }
    })

    console.log(spotReviews);

    if (spotReviews.length) {
            return res.status(500).json({
                "message": "User already has a review for this spot"
            })
    }

    const newReview = await Review.create({
        userId: user.id,
        spotId: Number(req.params.spotId),
        review,
        stars,
        createdAt: new Date(),
        updatedAt: new Date()
    })

    return res.status(201).json(newReview);
})


// Create a Booking from a Spot based on the Spot's id
const validateBooking = [
    check('startDate')
        .exists({ checkFalsy: true })
        .isDate()
        .isAfter()
        .withMessage('startDate cannot be in the past'),
    check('endDate')
        .exists({ checkFalsy: true }),
    check('startDate')
        .custom((endDate, { req }) => (endDate >= req.body.startDate))
        .withMessage("endDate cannot be on or before startDate"),
    handleValidationErrors
];

router.post('/:spotId/bookings', requireAuth, validateBooking, async (req, res, next) => {
    const { startDate, endDate } = req.body;
    const { user } = req;

    const spotFromId = await Spot.findByPk(req.params.spotId);

    if (!spotFromId) {
        return res.status(404).json({
            "message": "Spot couldn't be found"
        })
    }

    const bookingCheck = await Booking.findAll({
        where: {
            spotId: spotFromId.id
        }
    });

    for (let booking of bookingCheck) {
       
        const newStartDate = Date.parse(startDate);
        const newEndDate = Date.parse(endDate);
        const existingStartDate = Date.parse(booking.startDate);
        const existingEndDate = Date.parse(booking.endDate);

        const errors = {};
        const err = Error("Sorry, this spot is already booked for the specified dates");
        err.errors = errors;
        err.status = 403;
        err.title = "Bad request.";


        if (newStartDate >= existingStartDate
            && newStartDate <= existingEndDate) {
            errors.startDate = "Start date conflicts with an existing booking";
        }

        if (newEndDate >= existingStartDate
            && newEndDate <= existingEndDate) {
            errors.endDate = "End date conflicts with an existing booking";
        }

        if (newStartDate <= existingStartDate
            && newEndDate >= existingEndDate) {
            errors.startDate = "Start date conflicts with an existing booking";
            errors.endDate = "End date conflicts with an existing booking";
        }

        if (errors.startDate || errors.endDate) {
            throw err;
        }
    }

    if (spotFromId.ownerId !== user.id) {
        const newBooking = await Booking.create({
            spotId: Number(req.params.spotId),
            userId: user.id,
            startDate,
            endDate,
            createdAt: new Date(),
            updatedAt: new Date()
        })

        const newBookingWithId = await Booking.findOne({
            where: {
                spotId: newBooking.spotId,
                userId: newBooking.userId,
                startDate: newBooking.startDate,
                endDate: newBooking.endDate
            },
            attributes: {
                include: ['id']
            }
        })
        return res.status(201).json(newBookingWithId);
    } else {
        return res.json({ message: 'Owner cannot book their own spot' })
    }
})



const validateSpot = [
    check('address')
        .notEmpty()
        .withMessage('Street address is required'),
    check('city')
        .notEmpty()
        .withMessage('City is required'),
    check('state')
        .notEmpty()
        .withMessage('State is required'),
    check('country')
        .notEmpty()
        .withMessage('Country is required'),
    check('lat')
        .isFloat({ min: -90, max: 90 })
        .withMessage('Latitude must be within -90 and 90'),
    check('lng')
        .isFloat({ min: -180, max: 180 })
        .withMessage('Longitude must be within -180 and 180'),
    check('name')
        .notEmpty()
        .withMessage('Name is required'),
    check('name')
        .isLength({ max: 50 })
        .withMessage('Name must be less than 50 characters'),
    check('description')
        .notEmpty()
        .withMessage('Description is required'),
    check('price')
        .isFloat({ min: 0 })
        .withMessage('Price per day must be a positive number'),
    handleValidationErrors
]

// Create a Spot
router.post('/', requireAuth, validateSpot,
    async (req, res) => {
        const { address, city, state, country, lat, lng, name, description, price } = req.body;

        const { user } = req;

        let userId;

        if (user) {
            userId = user.id;
        }
        const spot = await Spot.create({ ownerId: userId, address, city, state, country, lat, lng, name, description, price });

        return res.status(201).json(spot)
    }
)


// Add an Image to a Spot based on the Spot's id
router.post('/:spotId/images', requireAuth, async (req, res) => {
    const { url, preview } = req.body;
    const { user } = req;

    const spotForPic = await Spot.findOne({
        where: {
            id: req.params.spotId
        }
    });

    if (!spotForPic) {
        res.status(404).json({
            "message": "Spot couldn't be found"
        })
    }

    if (spotForPic.ownerId === user.id) {
        const newSpotImage = await SpotImage.create({ spotId: req.params.spotId, url, preview })

        newImageCopy = newSpotImage.toJSON();
        delete newImageCopy.spotId;
        delete newImageCopy.updatedAt;
        delete newImageCopy.createdAt;

        return res.status(201).json(newImageCopy)
    } else {
        res.status(403);
        return res.json({
            "message": "Forbidden"
        })
    }

})


// Edit a Spot
router.put('/:spotId', requireAuth, validateSpot, async (req, res) => {
    const { address, city, state, country, lat, lng, name, description, price } = req.body;
    const { user } = req;

    const updatedSpot = await Spot.findOne({
        where: {
            id: req.params.spotId
        }
    })

    if (!updatedSpot) {
        res.status(404).json({
            "message": "Spot couldn't be found"
        })
    }

    if (updatedSpot.ownerId === user.id) {
        updatedSpot.set({ address, city, state, country, lat, lng, name, description, price });

        await updatedSpot.save();

        return res.json(updatedSpot);
    } else {
        return res.status(403).json({
            "message": "Forbidden"
        })
    }
})


// Delete a Spot
router.delete('/:spotId', requireAuth, async (req, res, next) => {
    const { user } = req;

    const spotFromId = await Spot.findOne({
        where: {
            id: req.params.spotId,
        },
    });

    if (!spotFromId) {
        res.status(404).json({
            "message": "Spot couldn't be found"
        })
    }

    if (spotFromId.ownerId === user.id) {
        await spotFromId.destroy();
        return res.status(200).json({ "message": "Successfully deleted" })
    } else {
        return res.status(403).json({
            "message": "Forbidden"
        })
    }
})


module.exports = router;