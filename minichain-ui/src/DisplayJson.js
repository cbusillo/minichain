import React, { useState } from 'react';
import TextWithCode from './TextWithCode';
import './DisplayJson.css';
import CodeBlock from './CodeBlock';


const MultiMedia = ({ path }) => {
  const url = path.startsWith("http") ? path : `http://localhost:8000/static/${path}`;
  // get the file type
  const extension = path.split('.').pop();
  if (['png', 'jpg', 'jpeg', 'gif'].includes(extension)) {
    return(
      <div class="media-container">
        {path} <br />
        <img src={url} alt="uploaded file" />
      </div>
    );
  }
  if (['mp4', 'webm'].includes(extension)) {
    return (
      <div class="media-container">
        {path} <br />
        <video controls>
          <source src={url} type={`video/${extension}`} />
        </video>
      </div>
    );
  }
  if (['mp3', 'wav'].includes(extension)) {
    return (
      <div class="media-container">
        {path} <br />  
        <audio controls>
          <source src={url} type={`audio/${extension}`} />
        </audio>
      </div>
    );
  }
  return path;
};


const DisplayJson = ({ data }) => {
  const [isFolded, setIsFolded] = useState({});
  // First: all the special cases
  if (data.name === 'python') {
    try {
      const parsed = JSON.parse(data.arguments);
      if (parsed.code) {
        return <CodeBlock code={parsed.code} />;
      }
    } catch (e) {
      // code was not wrapped in {code: ...}
    }
    return <CodeBlock code={data.arguments} />;
  }
  try {
    if (data.name === 'return' && JSON.parse(data.arguments).content) {
      return;
    }
  } catch (e) {
    // arguments was not a json
  }
  if (data.name === 'upload_file_to_chat') {
    try {
      const parsed = JSON.parse(data.arguments);
      const path = parsed.file;
      return <MultiMedia path={path} />;
    } catch (e) {}
  }

  if (data.generated_files) {
    // simply display all files
    return (
      <div>
        {data.generated_files.map((file, index) => (
          <div key={index}>
            <b>{file}</b>
            <MultiMedia path={file} />
          </div>
        ))}
      </div>
    );
  }

  const toggleFold = key => {
    setIsFolded({ ...isFolded, [key]: !isFolded[key] });
  };

  const removeLineNumbers = code => 
    code.split('\n').map(line => line.replace(/^\d+:\s*/, '')).join('\n');

  const renderData = (data, parentKey = '') => {
    if (data === null || data === undefined) {
      return '';
    }

    // all links should be medias
    if (typeof data === 'string' && data.startsWith('http')) {
      return <MultiMedia path={data} />;
    }

    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch (e) {
        if (data.startsWith('http')) {
          return (
            <a href={data} target="_blank" rel="noopener noreferrer">
              {data}
            </a>
          );
        } else {
          return <TextWithCode text={data} />;
        }
      }
    }

    if (typeof data === 'number' || typeof data === 'boolean') {
        return data.toString();
    }

    if (Array.isArray(data)) {
      return (
        <div>
          <b style={{ cursor: 'pointer' }} onClick={() => toggleFold(parentKey)}>
            Show/hide {data.length} elements
          </b>
          {!isFolded[parentKey] &&
            <table>
              <tbody>
                {data.map((element, index) => {
                  const newKey = `${parentKey}[${index}]`;
                  return (
                    <tr className="array-element" key={newKey}>
                      <td>
                        <button onClick={() => toggleFold(newKey)}>+</button>
                      </td>
                      <td>
                        {!isFolded[newKey] && renderData(element, newKey)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>}
        </div>
      );
    }
    console.log({ data, parentKey });
    if (data === null || data === undefined) {
      return '';
    }
    return Object.entries(data).map(([key, value]) => {
      const newKey = `${parentKey}.${key}`;
      if (key === 'code') {
        return (
            <CodeBlock key={newKey} code={removeLineNumbers(value)} />
        );
      }
      return (
        <div key={newKey} style={{ marginLeft: '20px' }}>
          <b style={{ cursor: 'pointer' }} onClick={() => toggleFold(newKey)}>
            {key + ' '}
          </b>
          {!isFolded[newKey] && (
            key === 'code'
              ? <CodeBlock code={removeLineNumbers(value)} />
              : renderData(value, newKey)
          )}
        </div>
      );
    });
  };

  return <div>{renderData(data)}</div>;
};

export default DisplayJson;
