import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const generateAccessTokenAndRefreshToken = async (userId) => {
  try {
    const user = await User.findById(userId);

    if (!user) {
      throw new ApiError(404, "User not found");
    }
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    return { refreshToken, accessToken };
  } catch (error) {
    console.error("Error in generateAccessTokenAndRefreshToken:", error); // Log original error
    throw new ApiError(
      500,
      "something went wrong while generating refresh and access token"
    );
  }
};

// Email Service Function
async function sendVerificationEmail(user, token, req) {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD,
    },
  });

  const verificationUrl = `${req.protocol}://${req.get("host")}/api/v1/users/verify-email/${token}`;

  const mailOptions = {
    from: `"QueryMind" <${process.env.EMAIL_FROM}>`,
    to: user.email,
    subject: "Complete Your Account Verification",
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          /* Your email styles here */
        </style>
      </head>
      <body>
        <div class="email-container">
          <!-- Your email template here -->
          <a href="${verificationUrl}">Verify Account</a>
        </div>
      </body>
      </html>
    `,
  };

  await transporter.sendMail(mailOptions);
}

const registerUser = asyncHandler(async (req, res) => {
  // Get user detail from frontend
  const { userName, email, password } = req.body;

  // Validation - not empty
  if (
    req.body === "" ||
    [userName, email, password].some((field) => field?.trim() === "")
  ) {
    throw new ApiError(400, "All fields are required");
  }

  // Run this once to clean up existing data
  await User.deleteMany({ $or: [{ userName: null }, { userName: "" }] });

  // Check if user already exists: username, email
  const existedUser = await User.findOne({
    $or: [{ email }, { userName }],
  });

  if (existedUser) {
    throw new ApiError(409, "User with Email or Username already exists");
  }

  // Create user object - create entry in db with verified: false
  const user = await User.create({
    email,
    password,
    userName: userName.toLowerCase().trim(),
    verified: false, // Add verification status
  });

  // Generate verification token
  const verificationToken = jwt.sign(
    {
      userId: user._id,
      purpose: "email_verification",
    },
    process.env.TOKEN_SECRET_KEY,
    { expiresIn: "24h" } // 24-hour expiry
  );

  // Create verification URL
  const verificationUrl = `${req.protocol}://${req.get("host")}/api/v1/users/verify-email/${verificationToken}`;

  //create transporter
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD, // Using app password if using Gmail
    },
  });

  // Email configuration
  const mailOptions = {
    from: process.env.EMAIL_FROM,
    to: user.email,
    subject: "Verify Your Email Address",
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body {
            font-family: 'Arial', sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f9f9f9;
          }
          .container {
            background-color: #ffffff;
            border-radius: 8px;
            padding: 30px;
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
          }
          .header {
            text-align: center;
            margin-bottom: 20px;
          }
          .logo {
            max-width: 150px;
            margin-bottom: 15px;
          }
          h1 {
            color: #2c3e50;
            font-size: 24px;
            margin-bottom: 20px;
          }
          .button {
            display: inline-block;
            padding: 12px 24px;
            background-color: #3498db;
            color: #ffffff !important;
            text-decoration: none;
            border-radius: 4px;
            font-weight: bold;
            margin: 20px 0;
          }
          .footer {
            margin-top: 30px;
            font-size: 12px;
            color: #7f8c8d;
            text-align: center;
          }
          .divider {
            border-top: 1px solid #ecf0f1;
            margin: 20px 0;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <!-- Replace with your logo -->
            <h1>Verify Your Email Address</h1>
          </div>
          
          <p>Hello ${user.userName},</p>
          <p>Thank you for registering with us! To complete your registration, please verify your email address by clicking the button below:</p>
          
          <div style="text-align: center;">
            <a href="${verificationUrl}" class="button">Verify Email</a>
          </div>
          
          <p>If the button doesn't work, copy and paste this link into your browser:</p>
          <p><small>${verificationUrl}</small></p>
          
          <div class="divider"></div>
          
          <p>This verification link will expire in <strong>24 hours</strong>.</p>
          <p>If you didn't request this email, you can safely ignore it.</p>
          
          <div class="footer">
            <p>© ${new Date().getFullYear()} Querymind. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `,
  };

  // Send verification email
  try {
    await transporter.sendMail(mailOptions);
  } catch (emailError) {
    // If email fails, delete the user to maintain data consistency
    console.log("Email sending error:", emailError);

    await User.findByIdAndDelete(user._id);
    throw new ApiError(500, "Failed to send verification email");
  }

  // Remove sensitive fields from response
  const createdUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  // Check for user creation
  if (!createdUser) {
    throw new ApiError(500, "Something went wrong while registering the user");
  }

  // Return response
  return res
    .status(201)
    .json(
      new ApiResponse(
        200,
        createdUser,
        "User registered successfully. Please check your email for verification instructions."
      )
    );
});

const verifyEmail = asyncHandler(async (req, res) => {
  const { token } = req.params;
  try {
    // Verify JWT token
    const decoded = jwt.verify(token, process.env.TOKEN_SECRET_KEY);

    // Check token purpose
    if (decoded.purpose !== "email_verification") {
      return res.redirect(
        `${process.env.FRONTEND_URL}/auth/verification-success.html`
      );
    }

    // Find and update user
    const user = await User.findByIdAndUpdate(
      decoded.userId,
      { $set: { verified: true } },
      { new: true }
    ).select("-password -refreshToken");

    if (!user) {
      return res.redirect(
        `${process.env.FRONTEND_URL}/auth/verification-success.html`
      );
    }

    return res.redirect(
      `${process.env.FRONTEND_URL}/auth/verification-success.html`
    );
  } catch (error) {
    return res.redirect(
      `${process.env.FRONTEND_URL}/auth/verification-success.html`
    );
  }
});

const loginUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Validation
  if (!email || !password) {
    throw new ApiError(400, "Email and password are required");
  }

  // Find user
  const user = await User.findOne({ email });
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  // Password verification
  const isPasswordValid = await user.isPasswordCorrect(password);
  if (!isPasswordValid) {
    throw new ApiError(401, "Invalid credentials");
  }

  // Email verification check
  if (!user.verified) {
    const verificationToken = jwt.sign(
      { userId: user._id, purpose: "email_verification" },
      process.env.VERIFICATION_TOKEN_SECRET,
      { expiresIn: "24h" }
    );

    try {
      await sendVerificationEmail(user, verificationToken, req);
    } catch (emailError) {
      console.error("Email sending failed:", emailError);
      // Continue even if email fails - but notify user
    }

    throw new ApiError(
      403,
      `Account not verified. A new verification email has been sent to ${user.email}. 
      Please check your inbox or spam folder.`
    );
  }

  // Generate tokens for verified users
  const { accessToken, refreshToken } =
    await generateAccessTokenAndRefreshToken(user._id);
  const loggedInUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  // Set secure cookies
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  };

  return res
    .status(200)
    .cookie("accessToken", accessToken, cookieOptions)
    .cookie("refreshToken", refreshToken, cookieOptions)
    .json(
      new ApiResponse(
        200,
        {
          user: loggedInUser,
          accessToken,
          refreshToken,
        },
        "Login successful"
      )
    );
});

const logoutUser = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(
    req.user._id,
    {
      $unset: {
        refreshToken: 1,
      },
    },
    { new: true }
  );

  const option = {
    httpOnly: true,
    secure: true,
  };

  return res
    .status(200)
    .clearCookie("accessToken", option)
    .clearCookie("refreshToken", option)
    .json(new ApiResponse(200, {}, "user logged out"));
});

const refreshAccessToken = asyncHandler(async (req, res) => {
  const incommingRefreshToken =
    req.cookies?.refreshToken || req.body.refreshToken;

  if (!incommingRefreshToken) {
    throw new ApiError(401, "unothorized request");
  }

  try {
    const decodedIncommingRrfreshToken = jwt.verify(
      incommingRefreshToken,
      process.env.REFRESH_TOKEN_SECRET
    );

    const user = await User.findById(decodedIncommingRrfreshToken?._id);
    console.log(user);

    if (!user) {
      throw new ApiError(401, "Invalid refresh token");
    }
    console.log(incommingRefreshToken);
    console.log(user.refreshToken);

    if (incommingRefreshToken !== user?.refreshToken) {
      throw new ApiError(401, " Refresh token is expired or used");
    }

    const option = {
      httpOnly: true,
      secure: true,
    };

    const { newAccessToken, newRefreshToken } =
      await generateAccessTokenAndRefreshToken(user._id);

    return res
      .status(200)
      .cookie("accessToken", newAccessToken, option)
      .cookie("refreshToken", newRefreshToken, option)
      .json(
        new ApiResponse(
          200,
          { accessToken: newAccessToken, refreshToken: newRefreshToken },
          "Accesss token refreshed"
        )
      );
  } catch (error) {
    throw new ApiError(401, error?.message || "Invalid refresh token");
  }
});

const changeCurrntPassword = asyncHandler(async (req, res) => {
  const { oldPassword, newPassword, conformPassword } = req.body;

  const user = await User.findById(req.user?._id);

  if (!user) {
    throw new ApiError(404, "user not found");
  }

  const isPasswordCorrect = await user.isPasswordCorrect(oldPassword);

  if (!isPasswordCorrect) {
    throw new ApiError(400, "password is incorrect");
  }

  if (!(newPassword === conformPassword)) {
    throw new ApiError(401, "please enter vlaid password");
  }

  user.password = newPassword;
  await user.save({ validateBeforeSave: false });

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Password changed successfully"));
});

const getCurrentUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select(
    "-password -refreshToken"
  );

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        data: {
          user: {
            userName: user.userName,
            email: user.email,
          },
        },
      },
      "Current user fetched successfully"
    )
  );
});

const forgetPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    throw new ApiError(400, "Email is required");
  }

  // Find user by email
  const user = await User.findOne({ email });
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  // Generate reset token (this now returns the unhashed token)
  const resetToken = user.createPasswordResetToken();
  await user.save({ validateBeforeSave: false });

  // Create reset URL (using the unhashed token)
  const resetUrl = `${process.env.FRONTEND_URL}/auth/reset-password.html?token=${resetToken}`;

  // Email configuration remains the same
  const mailOptions = {
    from: process.env.EMAIL_FROM,
    to: user.email,
    subject: "Password Reset Request",
    html: `
 <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e1e1e1; border-radius: 8px; overflow: hidden;">
        <div style="background: #4a6bff; padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">Password Reset</h1>
        </div>
        
        <div style="padding: 20px;">
            <p style="font-size: 16px;">Hello <strong>${user.userName}</strong>,</p>
            <p style="font-size: 16px;">We received a request to reset your password. Click the button below to proceed:</p>
            
            <div style="text-align: center; margin: 30px 0;">
                <a href="${resetUrl}" style="background: #4a6bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold; display: inline-block;">Reset Password</a>
            </div>
            
            <p style="font-size: 14px; color: #666;">This link will expire in <strong>10 minutes</strong>. If you didn't request a password reset, please ignore this email or contact support if you have questions.</p>
            
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e1e1e1;">
                <p style="font-size: 12px; color: #999;">For security reasons, we don't store your password. This link will expire after use.</p>
            </div>
        </div>
    </div>
    `,
  };

  //create transporter
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD, // Use app password if using Gmail
    },
  });

  // Send email
  try {
    await transporter.sendMail(mailOptions);
  } catch (error) {
    // Clear the reset token if email fails
    console.error("Failed to send email:", error);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save({ validateBeforeSave: false });

    throw new ApiError(500, "Failed to send password reset email");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Password reset link sent to email"));
});

const resetPassword = asyncHandler(async (req, res) => {
  const { token } = req.params;
  const { newPassword, confirmPassword } = req.body;

  console.log(token);

  if (!newPassword || !confirmPassword) {
    throw new ApiError(400, "All fields are required");
  }

  if (newPassword !== confirmPassword) {
    throw new ApiError(400, "Passwords do not match");
  }

  // Hash the token to compare with database
  const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

  // Find user by hashed reset token and check expiry
  const user = await User.findOne({
    resetPasswordToken: hashedToken,
    resetPasswordExpires: { $gt: Date.now() },
  });

  if (!user) {
    throw new ApiError(400, "Invalid or expired password reset token");
  }

  // Update password and clear reset token fields
  user.password = newPassword;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpires = undefined;
  await user.save();

  // Generate new tokens (optional)
  const { accessToken, refreshToken } =
    await generateAccessTokenAndRefreshToken(user._id);

  // Send confirmation email
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD,
    },
  });

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: user.email,
      subject: "Password Changed Successfully",
      html: `
        <p>Hello ${user.userName},</p>
        <p>This is a confirmation that the password for your account has been successfully changed.</p>
      `,
    });
  } catch (error) {
    throw new ApiError(400, "Failed to send email");
  }

  console.log("Received token from URL:", token);
  console.log(
    "Hashed token to find in DB:",
    crypto.createHash("sha256").update(token).digest("hex")
  );

  // Set cookies (optional)
  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  };

  return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(new ApiResponse(200, {}, "Password reset successfully"));
});

export {
  registerUser,
  loginUser,
  logoutUser,
  refreshAccessToken,
  changeCurrntPassword,
  getCurrentUser,
  verifyEmail,
  forgetPassword,
  resetPassword,
};
