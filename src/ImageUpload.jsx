import React from "react";
import { toast } from "react-toastify";

function ImageUpload({ imagePreview, setImagePreview, setImage, disabled }) {
  const handleImageUpload = (e) => {
    const file = e.target.files[0];

    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error("Image size should be less than 5MB");
        return;
      }
      if (!file.type.startsWith("image/")) {
        toast.error("Please upload an image file");
        return;
      }

      setImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result);
        toast.success("Image selected successfully!");
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveImage = () => {
    setImage(null);
    setImagePreview(null);
    toast.info("Image removed.");
  };

  return (
    <div className="form-group">
      <label htmlFor="image-upload">Upload an image:</label>
      <input
        type="file"
        id="image-upload"
        className="image-upload"
        accept="image/*"
        onChange={handleImageUpload}
        disabled={disabled}
      />
      <div
        className="upload-button"
        onClick={() =>
          !disabled && document.getElementById("image-upload").click()
        }
        style={{ opacity: disabled ? 0.7 : 1 }}
      >
        {imagePreview ? "Change image" : "Click to upload image"}
      </div>
      {imagePreview && (
        <div className="image-preview">
          <img src={imagePreview} alt="Preview" />
          <button
            type="button"
            className="remove-image"
            onClick={handleRemoveImage}
            disabled={disabled}
          >
            Remove image
          </button>
        </div>
      )}
    </div>
  );
}

export default ImageUpload;
