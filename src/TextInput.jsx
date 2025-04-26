import React from "react";

function TextInput({ text, onChange, disabled }) {
  return (
    <div className="form-group">
      <label htmlFor="text-input">Enter text to analyze:</label>
      <textarea
        id="text-input"
        className="text-input"
        value={text}
        onChange={onChange}
        placeholder="Paste your text here to check its credibility..."
        disabled={disabled}
      />
    </div>
  );
}

export default TextInput;
