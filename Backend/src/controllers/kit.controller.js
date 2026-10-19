import { Kit } from '../models/kit.model.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { runFullPipeline } from '../services/pipeline.service.js';

export const createKit = async (req, res, next) => {
  try {
    const { jd, company_url, days } = req.body;

    if (!jd || !company_url) {
      throw new ApiError(400, 'Job description and company URL are required');
    }

    const parsedDays = parseInt(days, 10) || 5;

    // Run the full AI retrieval and generation pipeline
    const kitData = await runFullPipeline({
      jd,
      companyUrl: company_url,
      days: parsedDays
    });

    const newKit = await Kit.create({
      userId: req.user._id,
      kitData
    });

    return res.status(201).json(new ApiResponse(201, newKit, 'Interview prep kit generated successfully'));
  } catch (error) {
    next(error);
  }
};

export const getUserKits = async (req, res, next) => {
  try {
    const kits = await Kit.find({ userId: req.user._id }).sort({ createdAt: -1 });
    return res.status(200).json(new ApiResponse(200, kits, 'User kits fetched successfully'));
  } catch (error) {
    next(error);
  }
};

export const getKitById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const kit = await Kit.findOne({ _id: id, userId: req.user._id });

    if (!kit) {
      throw new ApiError(404, 'Interview prep kit not found');
    }

    return res.status(200).json(new ApiResponse(200, kit, 'Kit fetched successfully'));
  } catch (error) {
    next(error);
  }
};

export const updateKit = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { kitData } = req.body;

    const kit = await Kit.findOne({ _id: id, userId: req.user._id });
    if (!kit) {
      throw new ApiError(404, 'Interview prep kit not found');
    }

    kit.kitData = kitData;
    await kit.save();

    return res.status(200).json(new ApiResponse(200, kit, 'Kit updated successfully'));
  } catch (error) {
    next(error);
  }
};

export const deleteKit = async (req, res, next) => {
  try {
    const { id } = req.params;
    const kit = await Kit.findOneAndDelete({ _id: id, userId: req.user._id });

    if (!kit) {
      throw new ApiError(404, 'Interview prep kit not found');
    }

    return res.status(200).json(new ApiResponse(200, {}, 'Kit deleted successfully'));
  } catch (error) {
    next(error);
  }
};